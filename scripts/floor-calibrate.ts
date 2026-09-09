/**
 * Calibrates the confidence floor. The top reranked score is the sole
 * answer-or-refuse signal, so its value comes from measured separation.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { embed } from "../src/rag/providers.ts";
import { DEFAULT_MODEL, rerank } from "../src/rag/rerank.ts";
import { connectAdmin, searchHybrid } from "../src/rag/store.ts";

const POOL = 10;

/** Genuinely outside the corpus: no plan document could answer these. */
const OUT_OF_CORPUS = [
  "what is the capital of France",
  "how do I change the oil in my car",
  "what is my dog's vaccination schedule",
  "how do I reset my email password",
  "what time does the supermarket close",
  "who won the football game last night",
  "how do I cook a turkey",
  "what is the weather tomorrow",
  "can you write me a poem about the sea",
  "what is the square root of 1444",
];

interface GoldenCase {
  id: string;
  bucket: string;
  question: string;
  plan: string;
  expect: { outcome: string };
}

const golden = JSON.parse(readFileSync("eval/golden/golden-set.json", "utf8")) as {
  cases: GoldenCase[];
};
const answerable = golden.cases.filter(
  (c) => c.bucket === "A" && c.expect.outcome === "answered",
);

const client = connectAdmin();
await client.connect();

async function topScore(question: string, plan: string): Promise<number> {
  const [vector] = await embed([question]);
  if (vector === undefined) return 0;
  const pool = await searchHybrid(
    client,
    vector,
    question,
    { contractId: "H5141", planId: plan, planYear: 2026 },
    POOL,
  );
  const ranked = await rerank(question, pool, DEFAULT_MODEL);
  return ranked[0]?.rerankScore ?? 0;
}

const positives: { id: string; question: string; score: number }[] = [];
const negatives: { id: string; question: string; score: number }[] = [];

try {
  for (const testCase of answerable) {
    positives.push({
      id: testCase.id,
      question: testCase.question,
      score: await topScore(testCase.question, testCase.plan),
    });
  }
  for (const [index, question] of OUT_OF_CORPUS.entries()) {
    negatives.push({ id: `OOC-${index + 1}`, question, score: await topScore(question, "004") });
  }
} finally {
  await client.end();
}

/** The floor that maximises correct decisions on both sides. */
let best = { floor: 0, correct: -1, falseRefusals: 0, falseAnswers: 0 };
for (let step = 0; step <= 1000; step += 1) {
  const floor = step / 1000;
  const falseRefusals = positives.filter((p) => p.score < floor).length;
  const falseAnswers = negatives.filter((n) => n.score >= floor).length;
  const correct = positives.length - falseRefusals + (negatives.length - falseAnswers);
  if (correct > best.correct) best = { floor, correct, falseRefusals, falseAnswers };
}

const sorted = (rows: { score: number }[]): number[] => rows.map((r) => r.score).sort((a, b) => a - b);
const pos = sorted(positives);
const neg = sorted(negatives);

console.log(`positives (answerable, n=${positives.length})`);
console.log(`  min ${pos[0]?.toFixed(4)}  p10 ${pos[Math.floor(pos.length * 0.1)]?.toFixed(4)}  median ${pos[Math.floor(pos.length / 2)]?.toFixed(4)}`);
console.log(`negatives (out of corpus, n=${negatives.length})`);
console.log(`  max ${neg.at(-1)?.toFixed(4)}  p90 ${neg[Math.floor(neg.length * 0.9)]?.toFixed(4)}`);
console.log(`\nbest floor ${best.floor}  false refusals ${best.falseRefusals}/${positives.length}  false answers ${best.falseAnswers}/${negatives.length}`);

console.log("\nlowest-scoring answerable questions:");
for (const row of [...positives].sort((a, b) => a.score - b.score).slice(0, 6)) {
  console.log(`  ${row.score.toFixed(4)}  ${row.id}  ${row.question.slice(0, 62)}`);
}
console.log("highest-scoring out-of-corpus questions:");
for (const row of [...negatives].sort((a, b) => b.score - a.score).slice(0, 3)) {
  console.log(`  ${row.score.toFixed(4)}  ${row.question.slice(0, 62)}`);
}

writeFileSync(
  "eval/results/floor-calibration.json",
  `${JSON.stringify({ ranAt: new Date().toISOString(), model: DEFAULT_MODEL, pool: POOL, best, positives, negatives }, null, 2)}\n`,
  "utf8",
);
console.log("\nwritten to eval/results/floor-calibration.json");
