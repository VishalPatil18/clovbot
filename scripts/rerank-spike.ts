/**
 * Chooses the reranker by measurement: whether the answering chunk ranks first,
 * how far answerable and unanswerable questions separate, and latency.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { embed } from "../src/rag/providers.ts";
import { rerank } from "../src/rag/rerank.ts";
import { connectAdmin, searchHybrid } from "../src/rag/store.ts";

const CANDIDATES = ["Xenova/ms-marco-MiniLM-L-6-v2", "Xenova/ms-marco-MiniLM-L-12-v2"];
const CANDIDATE_POOL = 20;

interface GoldenCase {
  id: string;
  bucket: string;
  question: string;
  plan: string;
  expect: { outcome: string; keyFact?: string | string[] };
}

const golden = JSON.parse(readFileSync("eval/golden/golden-set.json", "utf8")) as {
  cases: GoldenCase[];
};

/** Answerable cases with a checkable fact, plus the bucket B and C cases as negatives. */
const answerable = golden.cases.filter(
  (c) => c.bucket === "A" && c.expect.outcome === "answered" && c.expect.keyFact !== undefined,
);
const unanswerable = golden.cases.filter((c) => c.bucket === "B" || c.bucket === "C");

const client = connectAdmin();
await client.connect();

const pools = new Map<string, Awaited<ReturnType<typeof searchHybrid>>>();
try {
  for (const testCase of [...answerable, ...unanswerable]) {
    const [vector] = await embed([testCase.question]);
    if (vector === undefined) throw new Error(`no embedding for ${testCase.id}`);
    pools.set(
      testCase.id,
      await searchHybrid(
        client,
        vector,
        testCase.question,
        { contractId: "H5141", planId: testCase.plan, planYear: 2026 },
        CANDIDATE_POOL,
      ),
    );
  }
} finally {
  await client.end();
}

const rows: Record<string, unknown>[] = [];

for (const model of CANDIDATES) {
  let topOne = 0;
  let topFive = 0;
  let checked = 0;
  const answerableScores: number[] = [];
  const unanswerableScores: number[] = [];

  await rerank("warm up", pools.get(answerable[0]?.id ?? "") ?? [], model);
  const started = Date.now();

  for (const testCase of answerable) {
    const pool = pools.get(testCase.id) ?? [];
    if (pool.length === 0) continue;
    const ranked = await rerank(testCase.question, pool, model);
    answerableScores.push(ranked[0]?.rerankScore ?? 0);

    const facts = (
      Array.isArray(testCase.expect.keyFact) ? testCase.expect.keyFact : [testCase.expect.keyFact]
    ).filter((fact): fact is string => typeof fact === "string" && fact.length > 0);
    if (facts.length === 0) continue;

    const holdsAnswer = (text: string): boolean =>
      facts.some((fact) => text.toLowerCase().includes(fact.toLowerCase()));
    const position = ranked.findIndex((chunk) => holdsAnswer(chunk.content));
    if (position === -1) continue;

    checked += 1;
    if (position === 0) topOne += 1;
    if (position < 5) topFive += 1;
  }

  for (const testCase of unanswerable) {
    const pool = pools.get(testCase.id) ?? [];
    if (pool.length === 0) continue;
    const ranked = await rerank(testCase.question, pool, model);
    unanswerableScores.push(ranked[0]?.rerankScore ?? 0);
  }

  const elapsed = Date.now() - started;
  const queries = answerable.length + unanswerable.length;
  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  const percentile = (values: number[], q: number): number =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length * q)] ?? 0;

  const row = {
    model,
    accuracyAt1: checked === 0 ? 0 : topOne / checked,
    accuracyAt5: checked === 0 ? 0 : topFive / checked,
    checked,
    meanTopScoreAnswerable: mean(answerableScores),
    meanTopScoreUnanswerable: mean(unanswerableScores),
    p10Answerable: percentile(answerableScores, 0.1),
    p90Unanswerable: percentile(unanswerableScores, 0.9),
    msPerQuery: elapsed / queries,
  };
  rows.push(row);

  console.log(`\n${model}`);
  console.log(`  accuracy@1              ${(row.accuracyAt1 * 100).toFixed(1)}%  (${topOne}/${checked})`);
  console.log(`  accuracy@5              ${(row.accuracyAt5 * 100).toFixed(1)}%`);
  console.log(`  mean top score, answerable    ${row.meanTopScoreAnswerable.toFixed(4)}`);
  console.log(`  mean top score, unanswerable  ${row.meanTopScoreUnanswerable.toFixed(4)}`);
  console.log(`  p10 answerable / p90 unanswerable  ${row.p10Answerable.toFixed(4)} / ${row.p90Unanswerable.toFixed(4)}`);
  console.log(`  latency                 ${row.msPerQuery.toFixed(1)} ms per query (pool of ${CANDIDATE_POOL})`);
}

writeFileSync(
  "eval/results/rerank-spike.json",
  `${JSON.stringify({ ranAt: new Date().toISOString(), candidatePool: CANDIDATE_POOL, rows }, null, 2)}\n`,
  "utf8",
);
console.log("\nwritten to eval/results/rerank-spike.json");
