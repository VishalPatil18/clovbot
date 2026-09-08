import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { latestSnapshotId } from "../../src/corpus/snapshot.ts";
import { answerTurn } from "../../src/rag/answer-turn.ts";
import { connect } from "../../src/rag/store.ts";
import { judgeFaithfulness } from "../judges/faithfulness.ts";
import { buildReport, type Bucket, type CaseOutcome } from "./score.ts";
import type { PlanRef } from "../../src/types.ts";


const TOP_K = 5;

interface GoldenCase {
  id: string;
  bucket: Bucket;
  driver: string;
  question: string;
  planRef: PlanRef;
  enforced: boolean;
  expect: {
    outcome: "answered" | "refused";
    keyFact?: string | string[];
    sourceDocument?: string;
    mustCite?: boolean;
    mustNotContain?: string[];
  };
  note?: string;
}

const flags = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (token?.startsWith("--") === true) flags.set(token.slice(2), process.argv[i + 1] ?? "true");
}
const sample = Number(flags.get("sample") ?? "0");

const golden = JSON.parse(readFileSync("eval/golden/golden-set.json", "utf8")) as {
  cases: GoldenCase[];
};
const cases = sample > 0 ? golden.cases.slice(0, sample) : golden.cases;

const client = connect();
await client.connect();
const snapshotId = latestSnapshotId();
const outcomes: CaseOutcome[] = [];

try {
  for (const [index, testCase] of cases.entries()) {
    process.stdout.write(`  [${index + 1}/${cases.length}] ${testCase.id} `);
    outcomes.push(await runCase(testCase));
  }
} finally {
  await client.end();
}

const report = buildReport(outcomes);
print(report, outcomes);
persist(report, outcomes);

if (report.failures.length > 0) process.exit(1);

async function runCase(testCase: GoldenCase): Promise<CaseOutcome> {
  const turn = await answerTurn(client, testCase.question, {
    ...testCase.planRef,
  });

  const refused = turn.outcome !== "answered";

  // FR-32 makes an uncited claim unrenderable, so structural compliance is a
  // property of the payload rather than something scraped back out of prose.
  const uncitedClaims = (turn.payload?.claims ?? []).filter(
    (claim) => claim.citationIds.length === 0,
  );
  const structural = {
    compliant: uncitedClaims.length === 0,
    uncitedSentences: uncitedClaims.map((claim) => claim.text),
  };

  let faithfulness: number | null = null;
  if (!refused && turn.payload !== null) {
    const cited = turn.retrieved.filter((chunk) => turn.citedIds.includes(chunk.id));
    const judged = await judgeFaithfulness(
      turn.payload.claims.map((claim) => claim.text).join("\n"),
      cited.length > 0 ? cited : turn.retrieved,
    );
    faithfulness = judged.score;
  }

  const passed = evaluate(testCase, { answer: turn.answer, refused, structural });
  process.stdout.write(`${passed ? "pass" : "FAIL"}${testCase.enforced ? "" : " (not enforced)"}\n`);

  return {
    id: testCase.id,
    answer: turn.answer,
    bucket: testCase.bucket,
    driver: testCase.driver,
    enforced: testCase.enforced,
    passed,
    refused,
    faithfulness,
    structural,
    note: turn.refusalTrigger === null ? "" : `trigger ${turn.refusalTrigger}, score ${turn.rerankTopScore.toFixed(4)}`,
  };
}

function evaluate(
  testCase: GoldenCase,
  actual: { answer: string; refused: boolean; structural: { compliant: boolean } },
): boolean {
  if (testCase.expect.outcome === "refused") return actual.refused;
  if (actual.refused) return false;
  if (testCase.expect.mustCite === true && !actual.structural.compliant) return false;

  for (const banned of testCase.expect.mustNotContain ?? []) {
    if (actual.answer.toLowerCase().includes(banned.toLowerCase())) return false;
  }
  const fact = testCase.expect.keyFact;
  if (fact === undefined) return true;
  // Any one of the accepted forms counts: the same amount is worded many ways.
  const accepted = (Array.isArray(fact) ? fact : [fact]).filter((value) => value.length > 0);
  if (accepted.length === 0) return true;
  const haystack = actual.answer.toLowerCase();
  return accepted.some((value) => haystack.includes(value.toLowerCase()));
}

function print(report: ReturnType<typeof buildReport>, all: CaseOutcome[]): void {
  console.log("\n=== Eval report ===");
  console.log(`  snapshot            ${snapshotId}`);
  console.log(`  cases               ${all.length} (${all.filter((o) => o.enforced).length} enforced)`);
  console.log(
    `  faithfulness        ${report.faithfulness === null ? "n/a" : report.faithfulness.toFixed(3)} (floor 0.90)`,
  );
  console.log(`  structural          ${(report.structuralCompliance * 100).toFixed(1)}% compliant`);
  console.log(
    `  refusal rate        ${(report.refusalRate * 100).toFixed(1)}% [${report.refusalVerdict}]`,
  );
  console.log("  per bucket:");
  for (const bucket of report.buckets) {
    const accuracy = bucket.accuracy === null ? "not enforced" : `${(bucket.accuracy * 100).toFixed(1)}%`;
    console.log(`    ${bucket.bucket.padEnd(12)} ${bucket.passed}/${bucket.enforced} enforced of ${bucket.total} total  ${accuracy}`);
  }

  const failed = all.filter((outcome) => outcome.enforced && !outcome.passed);
  if (failed.length > 0) {
    console.log("  failing cases:");
    for (const outcome of failed) console.log(`    ${outcome.id} (${outcome.driver}) ${outcome.note}`);
  }
  if (report.failures.length > 0) {
    console.log("\n  BUILD FAILS:");
    for (const failure of report.failures) console.log(`    - ${failure}`);
  }
}

function persist(report: ReturnType<typeof buildReport>, all: CaseOutcome[]): void {
  mkdirSync("eval/results", { recursive: true });
  const path = `eval/results/${new Date().toISOString().slice(0, 16).replace(/:/g, "")}Z.json`;
  writeFileSync(path, `${JSON.stringify({ snapshotId, report, outcomes: all }, null, 2)}\n`, "utf8");
  console.log(`\n  written to ${path}`);
}
