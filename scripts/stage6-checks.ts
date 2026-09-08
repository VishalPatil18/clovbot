/**
 * The named edges in plan-p1 Stage 6. These need a real model, so they are a
 * script rather than unit tests, and the numbers are printed rather than asserted.
 */
import { validateAnswerPayload } from "../src/answer.ts";
import { answerTurn } from "../src/rag/answer-turn.ts";
import { buildStructuredPrompt, citationLabel, renderAnswer } from "../src/rag/payload.ts";
import { generate } from "../src/rag/providers.ts";
import { connect } from "../src/rag/store.ts";

const SCOPE = { contractId: "H5141", planId: "004", planYear: 2026 };
const FACT = /\$[\d,]+|\btier\s*\d/i;

let failures = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${label}`);
  if (detail.length > 0) console.log(`        ${detail}`);
};

// 1. Datastore unreachable. The plan calls this the most important test in the
//    stage: it is the only failure that looks like success.
console.log("\n1. Datastore unreachable [FR-09, FR-25]");
{
  const broken = { query: async () => { throw new Error("ECONNREFUSED"); } } as never;
  const turn = await answerTurn(broken, "what is my specialist copay", SCOPE);
  check("outcome is upstream_failure", turn.outcome === "upstream_failure", `got ${turn.outcome}`);
  check("no factual claim in the output", !FACT.test(turn.answer), turn.answer.slice(0, 90));
  check("human path offered", /1-888-778-1478/.test(turn.answer));
}

const client = connect();
await client.connect();

try {
  // 2. Below the floor refuses, and refuses without asserting anything.
  console.log("\n2. Below the confidence floor [FR-03]");
  {
    const turn = await answerTurn(client, "what is the capital of France", SCOPE);
    check("refused", turn.outcome === "refused", `trigger ${turn.refusalTrigger}`);
    check("no factual claim", !FACT.test(turn.answer));
    check("score recorded against the floor", Number.isFinite(turn.rerankTopScore),
      `score ${turn.rerankTopScore.toFixed(4)} vs floor ${turn.confidenceFloor}`);
  }

  // 3. Partial coverage names the gap rather than dropping it silently.
  console.log("\n3. Partial coverage [FR-05]");
  {
    const turn = await answerTurn(
      client,
      "what is my specialist copay and is Dr Rivera accepting new patients",
      SCOPE,
    );
    const gaps = turn.payload?.unanswered ?? [];
    check("answered the supported part", /\$\d/.test(turn.answer), turn.answer.split("\n")[0]?.slice(0, 80));
    check("named the unsupported part", gaps.length > 0, gaps.join(" | ").slice(0, 100));
  }

  // 4. EOC precedence on a genuine conflict, using controlled chunks so the
  //    conflict is real rather than inferred. D-039 removed the heuristic detector.
  console.log("\n4. Evidence of Coverage precedence [FR-07, D-020]");
  {
    const conflicting = [
      {
        id: "eoc-specialist-01",
        documentId: "H5141-004-2026-evidence_of_coverage",
        kind: "evidence_of_coverage" as const,
        contractId: "H5141", planId: "004", planYear: 2026,
        section: "Chapter 4: Medical Benefits Chart",
        content: "For specialist services you pay $45 for each visit to an in-network specialist.",
      },
      {
        id: "sob-specialist-01",
        documentId: "H5141-004-2026-summary_of_benefits",
        kind: "summary_of_benefits" as const,
        contractId: "H5141", planId: "004", planYear: 2026,
        section: "Doctor's Office",
        content: "Specialist visit: $40 copay per visit when you see an in-network specialist.",
      },
    ];
    const { text } = await generate(buildStructuredPrompt("what is my specialist copay", conflicting));
    const json = /\{[\s\S]*\}/.exec(text)?.[0] ?? text;
    const validated = validateAnswerPayload(JSON.parse(json));
    const rendered = validated.ok ? renderAnswer(validated.value, conflicting) : "";
    check("payload valid", validated.ok);
    check("returns the Evidence of Coverage amount", rendered.includes("$45"), rendered.slice(0, 120));
    check("states the conflict rather than hiding it", rendered.includes("$40"), "both amounts named");
  }

  // 5. A citation that cannot state its plan year is not a citation. FR-06.
  console.log("\n5. Citation without provenance [FR-06]");
  {
    const bad = {
      id: "x", documentId: "d", kind: "summary_of_benefits" as const,
      contractId: "H5141", planId: "004", planYear: Number.NaN,
      section: "Doctor's Office", content: "Specialist visit: $10 copay",
    };
    let threw = false;
    try { citationLabel(bad); } catch { threw = true; }
    check("rendering refuses rather than emitting an uncited amount", threw);
  }

  // 6. Streaming. FR-08.
  console.log("\n6. Token streaming [FR-08]");
  {
    let tokens = 0;
    const turn = await answerTurn(client, "what do I pay for an emergency room visit", SCOPE, {
      onToken: () => { tokens += 1; },
    });
    check("tokens streamed", tokens > 5, `${tokens} tokens`);
    check("time to first token recorded", (turn.latencyMs["firstToken"] ?? 0) > 0,
      `first token ${turn.latencyMs["firstToken"]}ms, total ${turn.latencyMs["total"]}ms`);
  }
} finally {
  await client.end();
}

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} checks FAILED`}`);
if (failures > 0) process.exit(1);
