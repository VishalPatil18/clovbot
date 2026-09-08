import { redactIdentifiers } from "../logging.ts";
import { latestSnapshotId, readSnapshot } from "../corpus/snapshot.ts";
import { planIngest, readSnapshotMarkdown } from "./ingest.ts";
import { describeChunk, readGeneratedContext, writeGeneratedContext } from "./context.ts";
import { buildPrompt, findUncitedIds, parseCitations } from "./prompt.ts";
import { embed, generate } from "./providers.ts";
import { connect, existingChunkContent, pruneChunks, searchHybrid, upsertChunks, writeTurn, type RetrievalMode } from "./store.ts";

const CONTRACT_ID = process.env["CORPUS_CONTRACT_ID"] ?? "H5141";
const PLAN_IDS = (process.env["CORPUS_PLAN_IDS"] ?? "004,007").split(",");
const PLAN_YEAR = Number(process.env["CORPUS_PLAN_YEAR"] ?? "2026");
const TOP_K = 5;
/** Azure embeddings are capped per minute by tokens, not requests. */
const TOKENS_PER_MINUTE = Number(process.env["AZURE_EMBEDDING_TPM"] ?? "29000");
const BATCH_TOKEN_BUDGET = 5_000;
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

async function ingest(): Promise<void> {
  const snapshotId = latestSnapshotId();
  const snapshot = readSnapshot(snapshotId);
  const { chunks, rejected } = planIngest(snapshot, PLAN_YEAR, readSnapshotMarkdown(snapshotId));

  for (const skip of rejected) console.log(`  skipped ${skip.documentId}: ${skip.reason}`);

  // D-006: headings carry context for most chunks; only the orphans need the model,
  // and their generated text is frozen so a second run does not churn.
  const orphans = chunks.filter((chunk) => chunk.needsGeneratedContext);
  const generated = readGeneratedContext(snapshotId);
  const missing = orphans.filter((chunk) => generated[chunk.id] === undefined);

  if (missing.length > 0) {
    console.log(`generating context for ${missing.length} chunks with no heading`);
    for (const chunk of missing) generated[chunk.id] = await describeChunk(chunk);
    writeGeneratedContext(snapshotId, generated);
  }
  for (const chunk of orphans) {
    const described = generated[chunk.id];
    if (described === undefined) continue;
    chunk.contextPrefix = described;
    chunk.embedText = `${described}\n\n${chunk.content}`;
  }

  const client = connect();
  await client.connect();
  try {
    const existing = await existingChunkContent(client, snapshotId);
    const changed = chunks.filter(
      (chunk) => existing.get(chunk.id) !== `${chunk.contextPrefix}\n${chunk.content}`,
    );
    console.log(`${chunks.length} chunks, ${changed.length} new or changed`);

    // Persist each batch, so a rate-limit failure costs one batch rather than all of them.
    let done = 0;
    for (const batch of batchByTokens(changed, BATCH_TOKEN_BUDGET)) {
      const tokens = batch.reduce((sum, chunk) => sum + estimateTokens(chunk.embedText), 0);
      const vectors = await embed(batch.map((chunk) => chunk.embedText));
      const embeddings = new Map<string, number[]>();
      for (const [index, chunk] of batch.entries()) {
        const vector = vectors[index];
        if (vector !== undefined) embeddings.set(chunk.id, vector);
      }
      await upsertChunks(client, batch, embeddings);
      done += batch.length;
      console.log(`  embedded and stored ${done}/${changed.length}`);

      // Stay under the per-minute token budget rather than retrying into it.
      if (done < changed.length) await sleep((tokens / TOKENS_PER_MINUTE) * 60_000);
    }

    const pruned = await pruneChunks(client, snapshotId, chunks.map((chunk) => chunk.id));
    if (pruned > 0) console.log(`pruned ${pruned} chunks no longer produced`);
  } finally {
    await client.end();
  }
  console.log(`snapshot ${snapshotId}: ${chunks.length} chunks indexed`);
}

async function ask(): Promise<void> {
  const { flags, words } = parseArgs(process.argv.slice(3));
  const planId = flags["plan"] ?? PLAN_IDS[0];
  const question = words.join(" ").trim();

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
    const mode = (flags["mode"] ?? "hybrid") as RetrievalMode;
    const retrieved = await searchHybrid(client, queryVector, redacted, scope, TOP_K, mode);
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Batches sized by estimated tokens, because the quota is measured in tokens. */
function batchByTokens<T extends { embedText: string }>(items: T[], budget: number): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  let tokens = 0;

  for (const item of items) {
    const cost = estimateTokens(item.embedText);
    if (batch.length > 0 && tokens + cost > budget) {
      batches.push(batch);
      batch = [];
      tokens = 0;
    }
    batch.push(item);
    tokens += cost;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/** Flags are `--name value`; everything else is the question. */
function parseArgs(argv: string[]): { flags: Record<string, string>; words: string[] } {
  const flags: Record<string, string> = {};
  const words: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token.startsWith("--")) {
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith("--")) {
        flags[token.slice(2)] = value;
        i += 1;
        continue;
      }
      flags[token.slice(2)] = "true";
      continue;
    }
    words.push(token);
  }
  return { flags, words };
}

const commands: Record<string, () => Promise<void>> = { ingest, ask };
const run = commands[process.argv[2] ?? ""];
if (run === undefined) {
  console.error("usage: rag <ingest|ask>");
  process.exit(1);
}
await run();
