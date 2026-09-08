import { readFileSync } from "node:fs";
import { redactIdentifiers } from "../logging.ts";
import { latestSnapshotId, markdownPath } from "../corpus/snapshot.ts";
import { chunkSummaryOfBenefits, type CorpusChunk } from "./chunk.ts";
import { buildPrompt, findUncitedIds, parseCitations } from "./prompt.ts";
import { embed, generate } from "./providers.ts";
import { connect, replaceChunks, searchByVector, writeTurn } from "./store.ts";

const CONTRACT_ID = process.env["CORPUS_CONTRACT_ID"] ?? "H5141";
const PLAN_IDS = (process.env["CORPUS_PLAN_IDS"] ?? "004,007").split(",");
const PLAN_YEAR = Number(process.env["CORPUS_PLAN_YEAR"] ?? "2026");
const TOP_K = 5;
const EMBED_BATCH = 64;

async function ingest(): Promise<void> {
  const snapshotId = latestSnapshotId();
  const chunks: CorpusChunk[] = PLAN_IDS.flatMap((planId) => {
    const documentId = `${CONTRACT_ID}-${planId}-${PLAN_YEAR}-summary_of_benefits`;
    const text = readFileSync(markdownPath(snapshotId, documentId), "utf8");
    return chunkSummaryOfBenefits(text, {
      documentId,
      contractId: CONTRACT_ID,
      planId,
      planYear: PLAN_YEAR,
      snapshotId,
    });
  });

  const vectors: number[][] = [];
  for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
    const batch = chunks.slice(start, start + EMBED_BATCH);
    vectors.push(...(await embed(batch.map((chunk) => chunk.content))));
    console.log(`embedded ${vectors.length}/${chunks.length}`);
  }

  const client = connect();
  await client.connect();
  try {
    await replaceChunks(client, snapshotId, chunks, vectors);
  } finally {
    await client.end();
  }
  console.log(`indexed ${chunks.length} chunks from snapshot ${snapshotId}`);
}

async function ask(): Promise<void> {
  const args = process.argv.slice(3);
  const planFlag = args.indexOf("--plan");
  const planId = planFlag === -1 ? PLAN_IDS[0] : args[planFlag + 1];
  const question = args.filter((_, i) => i !== planFlag && i !== planFlag + 1).join(" ").trim();

  if (question.length === 0 || planId === undefined) {
    throw new Error('usage: npm run ask -- "your question" --plan 004');
  }
  if (!PLAN_IDS.includes(planId)) {
    throw new Error(`plan ${planId} is not indexed; indexed plans are ${PLAN_IDS.join(", ")}`);
  }

  // FR-31, and D-034: redact before the model call, not only before the log write.
  const redacted = redactIdentifiers(question);
  const startedAt = Date.now();

  const client = connect();
  await client.connect();
  try {
    const [queryVector] = await embed([redacted]);
    if (queryVector === undefined) throw new Error("no embedding returned for the question");
    const embeddedAt = Date.now();

    const scope = { contractId: CONTRACT_ID, planId, planYear: PLAN_YEAR };
    const retrieved = await searchByVector(client, queryVector, scope, TOP_K);
    const retrievedAt = Date.now();

    if (retrieved.length === 0) {
      // FR-09: nothing retrieved means refuse. There is no degraded answering mode.
      console.log(
        "I could not find anything in the plan documents I searched for that question.\n" +
          "Please call Member Services at 1-888-778-1478 (TTY 711), 8am-8pm local time.",
      );
      await writeTurn(client, {
        question: redacted,
        planContext: `${CONTRACT_ID}-${planId}`,
        chunkIds: [],
        corpusSnapshotId: latestSnapshotId(),
        outcome: "refused",
        provider: "none",
        latencyMs: { retrieval: retrievedAt - startedAt },
      });
      return;
    }

    const answer = await generate(buildPrompt(redacted, retrieved));
    const completedAt = Date.now();

    const uncited = findUncitedIds(answer.text, retrieved.map((chunk) => chunk.id));
    if (uncited.length > 0) {
      throw new Error(
        `answer cited chunks that were never retrieved: ${uncited.join(", ")}. Refusing to show it.`,
      );
    }

    // No citation means the model found nothing it could support, which is a
    // refusal however politely it is worded. Stage 6 replaces this with the
    // reranker confidence floor; until then the metric must not read as answered.
    const citations = parseCitations(answer.text);
    const outcome = citations.length > 0 ? "answered" : "refused";

    console.log(`\n${answer.text}\n`);
    console.log("Sources:");
    for (const id of citations) {
      const chunk = retrieved.find((candidate) => candidate.id === id);
      if (chunk === undefined) continue;
      console.log(
        `  [${chunk.id}] ${chunk.documentId}, ${chunk.contractId}-${chunk.planId}, ` +
          `plan year ${chunk.planYear}, section "${chunk.section}"`,
      );
    }

    const turnId = await writeTurn(client, {
      question: redacted,
      planContext: `${CONTRACT_ID}-${planId}`,
      chunkIds: retrieved.map((chunk) => chunk.id),
      corpusSnapshotId: latestSnapshotId(),
      outcome,
      provider: answer.provider,
      latencyMs: {
        embedding: embeddedAt - startedAt,
        retrieval: retrievedAt - embeddedAt,
        generation: completedAt - retrievedAt,
        total: completedAt - startedAt,
      },
    });
    console.log(`\nturn ${turnId} | provider ${answer.provider} | ${completedAt - startedAt}ms`);
  } finally {
    await client.end();
  }
}

const commands: Record<string, () => Promise<void>> = { ingest, ask };
const run = commands[process.argv[2] ?? ""];
if (run === undefined) {
  console.error("usage: rag <ingest|ask>");
  process.exit(1);
}
await run();
