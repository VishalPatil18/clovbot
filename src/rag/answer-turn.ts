import { findContainmentViolations, validateAnswerPayload } from "../answer.ts";
import { checkGuardrails } from "../guardrails.ts";
import { detectLanguage } from "../language.ts";
import { applyConfidenceGate } from "../retrieval.ts";
import { redactIdentifiers } from "../logging.ts";
import type { AnswerPayload } from "../types.ts";
import { MEMBER_SERVICES, buildStructuredPrompt, renderAnswer } from "./payload.ts";
import { generate, generateStream } from "./providers.ts";
import { embed } from "./providers.ts";
import { rerank, type RerankedChunk } from "./rerank.ts";
import { loadDrugIndex, lookupDrugs, searchHybrid, type DrugLookup } from "./store.ts";
import { chooseRoute, type RouteDecision } from "./router.ts";
import { latestSnapshotId } from "../corpus/snapshot.ts";
import type pg from "pg";

/** Calibrated, not chosen. eval/results/floor-calibration.json. D-038. */
export const CONFIDENCE_FLOOR = Number(process.env["CONFIDENCE_FLOOR"] ?? "0.001");
export const CANDIDATE_POOL = 10;
export const TOP_K = 5;

export interface TurnResult {
  question: string;
  answer: string;
  payload: AnswerPayload | null;
  retrieved: RerankedChunk[];
  citedIds: string[];
  rerankTopScore: number;
  confidenceFloor: number;
  outcome: "answered" | "refused" | "upstream_failure";
  refusalTrigger: string | null;
  provider: string;
  latencyMs: Record<string, number>;
  route: RouteDecision;
}

const refusalText = (explanation: string): string =>
  `${explanation}\n\nTo speak with a person, call Member Services at ${MEMBER_SERVICES}.`;

const NOT_FOUND =
  "I could not find an answer to that in the plan documents I searched.";

/** An exact table row outranks anything the reranker can score. */
const EXACT_MATCH_SCORE = 1;

const RAG_ONLY: RouteDecision = { paths: ["rag"], drugs: [], reason: "router unavailable" };

/** Loaded once per snapshot: the index changes only when the corpus is re-ingested. */
const drugIndexes = new Map<string, Set<string>>();

async function drugIndexFor(client: pg.Client, snapshotId: string): Promise<Set<string>> {
  const cached = drugIndexes.get(snapshotId);
  if (cached !== undefined) return cached;
  const index = await loadDrugIndex(client, snapshotId);
  drugIndexes.set(snapshotId, index);
  return index;
}

/**
 * A typed row rendered as a citable source, so a structured answer travels the
 * same prompt, citation and validation path as a retrieved one. FR-P2-11.
 */
export function drugAsChunk(row: DrugLookup, snapshotId: string): RerankedChunk {
  const requirements = row.requirements.length > 0 ? row.requirements : "none";
  return {
    id: `${row.documentId}-drug-${row.normalizedName.replace(/[^a-z0-9]+/g, "-")}`,
    documentId: row.documentId,
    kind: "formulary",
    contractId: "*",
    planId: "*",
    planYear: row.planYear,
    section: `${row.category} > ${row.normalizedName}`,
    content:
      `${row.name} is on Tier ${String(row.tier)} of the ${String(row.planYear)} drug list. ` +
      `Therapeutic class: ${row.category}. Requirements or limits: ${requirements}.`,
    distance: 0,
    rerankScore: EXACT_MATCH_SCORE,
  };
}

/**
 * One turn, end to end. Shared by the CLI and the eval harness so the thing
 * measured is the thing shipped.
 */
export async function answerTurn(
  client: pg.Client,
  rawQuestion: string,
  scope: { contractId: string; planId: string; planYear: number },
  options: { onToken?: (token: string) => void } = {},
): Promise<TurnResult> {
  // FR-31, and D-034: redact before the model call, not only before the log write.
  const question = redactIdentifiers(rawQuestion);
  const started = Date.now();

  const base = {
    question,
    payload: null,
    retrieved: [] as RerankedChunk[],
    citedIds: [] as string[],
    confidenceFloor: CONFIDENCE_FLOOR,
    provider: "none",
    route: RAG_ONLY,
  };

  // FR-24. Answered in English, with the human path, and no partial attempt.
  if (detectLanguage(question) === "other") {
    return {
      ...base,
      answer: refusalText(
        "I can only answer in English today. A person at the plan can help you in your language.",
      ),
      rerankTopScore: Number.NEGATIVE_INFINITY,
      outcome: "refused",
      refusalTrigger: "unsupported_language",
      latencyMs: { total: Date.now() - started },
    };
  }

  // FR-21. Bucket C is decided before retrieval, so a guarded question never
  // reaches the model and cannot leak a partial answer on its way to refusal.
  const guard = checkGuardrails(question);
  if (guard !== null) {
    return {
      ...base,
      answer:
        guard.kind === "emergency"
          ? `${guard.explanation}\n\nOnce you are safe, Member Services can help with anything about your plan: ${MEMBER_SERVICES}.`
          : refusalText(guard.explanation),
      rerankTopScore: Number.NEGATIVE_INFINITY,
      outcome: "refused",
      refusalTrigger: guard.trigger,
      latencyMs: { total: Date.now() - started },
    };
  }

  let retrieved: RerankedChunk[] = [];
  let retrievedAt = started;
  let route: RouteDecision = RAG_ONLY;
  try {
    // FR-P2-09, D-061. Selection is a lookup against indexed drug names, so a
    // tier question about a drug we hold cannot degrade to prose search.
    const snapshotId = latestSnapshotId();
    route = chooseRoute(question, await drugIndexFor(client, snapshotId));

    const structured = route.paths.includes("structured")
      ? (await lookupDrugs(client, snapshotId, route.drugs)).map((row) =>
          drugAsChunk(row, snapshotId),
        )
      : [];

    // D-062: paths are additive, so a question that is both a lookup and a rules
    // question keeps both halves and neither can be dropped.
    let prose: RerankedChunk[] = [];
    if (route.paths.includes("rag")) {
      const [vector] = await embed([question]);
      if (vector === undefined) throw new Error("no embedding returned");
      const pool = await searchHybrid(client, vector, question, scope, CANDIDATE_POOL);
      prose = (await rerank(question, pool)).slice(0, TOP_K);
    }
    retrieved = [...structured, ...prose];
    retrievedAt = Date.now();
  } catch (error) {
    // FR-09 and FR-25: an upstream failure never produces a factual claim.
    return {
      ...base,
      answer: refusalText(
        "I am having trouble reaching the plan documents right now, so I cannot answer safely.",
      ),
      rerankTopScore: Number.NEGATIVE_INFINITY,
      outcome: "upstream_failure",
      refusalTrigger: "upstream_failure",
      route,
      latencyMs: { total: Date.now() - started },
      note: error instanceof Error ? error.message : String(error),
    } as TurnResult;
  }

  const topScore = retrieved[0]?.rerankScore ?? Number.NEGATIVE_INFINITY;
  const gate = applyConfidenceGate(topScore, CONFIDENCE_FLOOR);

  if (retrieved.length === 0 || gate.kind === "refuse") {
    return {
      ...base,
      retrieved,
      answer: refusalText(NOT_FOUND),
      rerankTopScore: topScore,
      outcome: "refused",
      refusalTrigger: "below_floor",
      route,
      latencyMs: { retrieval: retrievedAt - started, total: Date.now() - started },
    };
  }

  // FR-07 is carried by the standing prompt rule that the Evidence of Coverage
  // controls. An automated amount-diff detector was removed: it compared amounts
  // from unrelated benefits, and telling the model a conflict existed made it
  // invent one and call a correct document wrong.
  const prompt = buildStructuredPrompt(question, retrieved);

  let raw: string;
  let provider: string;
  let firstTokenAt = retrievedAt;
  try {
    if (options.onToken === undefined) {
      const generated = await generate(prompt);
      raw = generated.text;
      provider = generated.provider;
    } else {
      let seen = false;
      const generated = await generateStream(prompt, (token) => {
        if (!seen) {
          seen = true;
          firstTokenAt = Date.now();
        }
        options.onToken?.(token);
      });
      raw = generated.text;
      provider = generated.provider;
    }
  } catch (error) {
    return {
      ...base,
      retrieved,
      answer: refusalText("I could not produce an answer right now."),
      rerankTopScore: topScore,
      outcome: "upstream_failure",
      refusalTrigger: "upstream_failure",
      route,
      provider: "none",
      latencyMs: { retrieval: retrievedAt - started, total: Date.now() - started },
      note: error instanceof Error ? error.message : String(error),
    } as TurnResult;
  }

  const completedAt = Date.now();
  const latencyMs = {
    retrieval: retrievedAt - started,
    firstToken: firstTokenAt - started,
    generation: completedAt - retrievedAt,
    total: completedAt - started,
  };

  const json = /\{[\s\S]*\}/.exec(raw)?.[0];
  const validated = validateAnswerPayload(json === undefined ? raw : JSON.parse(json));

  if (!validated.ok) {
    // An uncited claim cannot be rendered, so a payload that fails validation
    // refuses rather than degrading to prose. FR-32.
    return {
      ...base,
      retrieved,
      answer: refusalText(NOT_FOUND),
      rerankTopScore: topScore,
      outcome: "refused",
      refusalTrigger: "invalid_payload",
      provider,
      latencyMs,
      note: validated.errors.join("; "),
    } as TurnResult;
  }

  const violations = findContainmentViolations(validated.value, retrieved.map((c) => c.id));
  if (violations.length > 0) {
    return {
      ...base,
      retrieved,
      answer: refusalText(NOT_FOUND),
      rerankTopScore: topScore,
      outcome: "refused",
      refusalTrigger: "citation_not_retrieved",
      provider,
      latencyMs,
      note: `cited unretrieved chunks: ${violations.join(", ")}`,
      route,
    } as TurnResult;
  }

  const payload = validated.value;
  const answered = payload.claims.length > 0;

  return {
    question,
    answer: answered || payload.refusal !== null ? renderAnswer(payload, retrieved) : refusalText(NOT_FOUND),
    payload,
    retrieved,
    citedIds: [...new Set(payload.claims.flatMap((claim) => claim.citationIds))],
    rerankTopScore: topScore,
    confidenceFloor: CONFIDENCE_FLOOR,
    outcome: answered ? "answered" : "refused",
    refusalTrigger: answered ? null : (payload.refusal?.trigger ?? "no_supported_claim"),
    provider,
    latencyMs,
    route,
  };
}
