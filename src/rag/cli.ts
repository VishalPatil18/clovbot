import { redactIdentifiers } from "../logging.ts";
import { latestSnapshotId, readSnapshot } from "../corpus/snapshot.ts";
import { CORPUS_SCOPE, findPlanRef, formatPlanRef } from "../corpus/scope.ts";
import { planIngest, readSnapshotMarkdown } from "./ingest.ts";
import { describeChunk, readGeneratedContext, writeGeneratedContext } from "./context.ts";
import { answerTurn } from "./answer-turn.ts";
import { citationLabel } from "./payload.ts";
import { embed, generate } from "./providers.ts";
import { connect, existingChunkContent, pruneChunks, upsertChunks, writeTurn } from "./store.ts";

const PLAN_YEAR = CORPUS_SCOPE.planYear;
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
  const fallback = CORPUS_SCOPE.plans[0];
  const contractId = flags["contract"] ?? fallback?.contractId;
  const planId = flags["plan"] ?? fallback?.planId;
  const question = words.join(" ").trim();

  if (question.length === 0 || contractId === undefined || planId === undefined) {
    throw new Error('usage: npm run ask -- "your question" --contract H5141 --plan 004');
  }
  const planRef = findPlanRef(contractId, planId);
  if (planRef === null) {
    throw new Error(
      `${contractId}-${planId} is not indexed; indexed plans are ` +
        `${CORPUS_SCOPE.plans.map(formatPlanRef).join(", ")}`,
    );
  }

  const client = connect();
  await client.connect();
  try {
    const turn = await answerTurn(client, question, planRef);

    console.log(`\n${turn.answer}\n`);
    if (turn.citedIds.length > 0) {
      console.log("Sources:");
      for (const id of turn.citedIds) {
        const chunk = turn.retrieved.find((candidate) => candidate.id === id);
        if (chunk !== undefined) console.log(`  ${citationLabel(chunk)}`);
      }
    }

    const turnId = await writeTurn(client, {
      question: turn.question,
      planContext: formatPlanRef(planRef),
      chunkIds: turn.retrieved.map((chunk) => chunk.id),
      corpusSnapshotId: latestSnapshotId(),
      outcome: turn.outcome,
      provider: turn.provider,
      latencyMs: {
        ...turn.latencyMs,
        rerankTopScore: Math.round(turn.rerankTopScore * 10_000) / 10_000,
        confidenceFloor: turn.confidenceFloor,
      },
    });
    console.log(
      `\nturn ${turnId} | ${turn.outcome}${turn.refusalTrigger === null ? "" : ` (${turn.refusalTrigger})`}` +
        ` | score ${turn.rerankTopScore.toFixed(4)} vs floor ${turn.confidenceFloor}` +
        ` | ${turn.provider} | ${turn.latencyMs["total"] ?? 0}ms`,
    );
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
