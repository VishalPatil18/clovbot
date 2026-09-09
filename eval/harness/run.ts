import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { latestSnapshotId } from "../../src/corpus/snapshot.ts";
import { answerTurn } from "../../src/rag/answer-turn.ts";
import { connect, loadDrugIndex } from "../../src/rag/store.ts";
import { chooseRoute, type RoutePath } from "../../src/rag/router.ts";
import { needsMemberData } from "../../src/auth/login-required.ts";
import { judgeFaithfulness } from "../judges/faithfulness.ts";
import { buildReport, type Bucket, type CaseOutcome } from "./score.ts";
import type { PlanRef } from "../../src/types.ts";


const TOP_K = 5;
/** NFR-P2-03. Aggregate floor; the structured direction is zero-tolerance. */
const ROUTING_FLOOR = 0.9;
/** NFR-P2-02. False positives are gated; false negatives are not tolerated. */
const LOGIN_FALSE_POSITIVE_FLOOR = 0.95;

/*
 * NFR-P2-04. Regression floors, set one case below the measured baseline rather
 * than at it.
 *
 * A-21's faithfulness has scored 0 in two of six runs with no code change: the
 * model sometimes adds "before the drug will be covered", which its cited chunk
 * does not say. One case of 36 is 0.028, so a strict 1.000 gate would fail the
 * build on that alone. One flip passes here; two do not.
 */
const BASELINE = {
  faithfulness: 0.96,
  structural: 1,
  refusalRate: 0.2,
  buckets: { A: 36 / 40, B: 8 / 8, C: 10 / 10 },
} as const;

function checkRegression(report: ReturnType<typeof buildReport>): boolean {
  const failures: string[] = [];
  // Null means nothing was judged, which is itself a reason not to pass.
  if (report.faithfulness === null || report.faithfulness < BASELINE.faithfulness) {
    failures.push(
      `faithfulness ${report.faithfulness?.toFixed(3) ?? "not measured"} below ${String(BASELINE.faithfulness)}`,
    );
  }
  if (report.structuralCompliance < BASELINE.structural) {
    failures.push(`structural compliance ${report.structuralCompliance.toFixed(3)} below 1`);
  }
  if (report.refusalRate > BASELINE.refusalRate) {
    failures.push(`refusal rate ${report.refusalRate.toFixed(3)} above ${String(BASELINE.refusalRate)}`);
  }
  for (const bucket of report.buckets) {
    const floor = BASELINE.buckets[bucket.bucket as keyof typeof BASELINE.buckets];
    if (floor === undefined || (bucket.accuracy ?? 0) >= floor) continue;
    failures.push(`bucket ${bucket.bucket} ${bucket.passed}/${bucket.total} below its floor`);
  }

  console.log("\n=== Regression gate (NFR-P2-04) ===");
  if (failures.length === 0) {
    console.log("  every P1 metric is at or above its floor");
    return false;
  }
  for (const failure of failures) console.log(`  REGRESSION: ${failure}`);
  return true;
}

interface GoldenCase {
  id: string;
  bucket: Bucket;
  driver: string;
  question: string;
  planRef: PlanRef;
  enforced: boolean;
  expect: {
    outcome: "answered" | "refused" | "needs_login";
    /** Which kind of record data the login is for. FR-P2-49. */
    recordTopic?: string;
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

const routing = await scoreRouting();
const login = scoreLogin();

const report = buildReport(outcomes);
print(report, outcomes);
const regressed = checkRegression(report);
persist(report, outcomes);

if (report.failures.length > 0 || routing.failed || login.failed || regressed) process.exit(1);

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

  const passed = evaluate(testCase, { answer: turn.answer, refused, outcome: turn.outcome, structural });
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
  actual: {
    answer: string;
    refused: boolean;
    outcome: string;
    structural: { compliant: boolean };
  },
): boolean {
  /*
   * FR-P2-49. A gated turn is neither answered nor refused: it offered a login.
   * Checked before the refusal branch, because a needs_login turn is not
   * refused and would otherwise read as a failure.
   */
  if (testCase.expect.outcome === "needs_login") return actual.outcome === "needs_login";
  if (actual.outcome === "needs_login") return false;
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

interface LoginCase {
  id: string;
  question: string;
  needsMemberData: boolean;
  note: string;
}

function scoreLogin(): { failed: boolean } {
  const cases = (
    JSON.parse(readFileSync("eval/golden/login-set.json", "utf8")) as { cases: LoginCase[] }
  ).cases;

  const falseNegatives: string[] = [];
  const falsePositives: string[] = [];
  for (const testCase of cases) {
    const gated = needsMemberData(testCase.question) !== null;
    if (testCase.needsMemberData && !gated) falseNegatives.push(testCase.id);
    if (!testCase.needsMemberData && gated) falsePositives.push(testCase.id);
  }

  const publicCases = cases.filter((c) => !c.needsMemberData).length;
  const positiveAccuracy =
    publicCases === 0 ? 1 : (publicCases - falsePositives.length) / publicCases;
  // Never one aggregate: the two directions cost different things.
  const failed = falseNegatives.length > 0 || positiveAccuracy < LOGIN_FALSE_POSITIVE_FLOOR;

  console.log("\n=== Login detection report ===");
  console.log(`  cases               ${String(cases.length)}`);
  console.log(`  member questions answered without identity  ${String(falseNegatives.length)} [zero tolerance]`);
  console.log(`  public questions gated  ${String(falsePositives.length)} of ${String(publicCases)}` +
    ` (accuracy ${positiveAccuracy.toFixed(3)}, floor ${String(LOGIN_FALSE_POSITIVE_FLOOR)})`);
  if (falseNegatives.length > 0) console.log(`  false negatives: ${falseNegatives.join(", ")}`);
  if (falsePositives.length > 0) console.log(`  false positives: ${falsePositives.join(", ")}`);

  writeFileSync(
    "eval/results/login-latest.json",
    `${JSON.stringify({ snapshotId, cases: cases.length, falseNegatives, falsePositives, positiveAccuracy, failed }, null, 2)}\n`,
    "utf8",
  );
  return { failed };
}

interface RoutingCase {
  id: string;
  question: string;
  expectedPaths: RoutePath[];
  note: string;
}

interface RoutingResult {
  total: number;
  correct: number;
  accuracy: number;
  /** The direction D-007 exists to prevent: a lookup falling through to prose. */
  structuredMissed: string[];
  confusion: Record<string, number>;
  failed: boolean;
  wrong: { id: string; expected: string; actual: string }[];
}

async function scoreRouting(): Promise<RoutingResult> {
  const routingCases = (
    JSON.parse(readFileSync("eval/golden/routing-set.json", "utf8")) as { cases: RoutingCase[] }
  ).cases;

  const client = connect();
  await client.connect();
  let index: Set<string>;
  try {
    index = await loadDrugIndex(client, snapshotId);
  } finally {
    await client.end();
  }

  const key = (paths: readonly string[]): string => [...paths].sort().join("+");
  const confusion: Record<string, number> = {};
  const structuredMissed: string[] = [];
  const wrong: RoutingResult["wrong"] = [];
  let correct = 0;

  for (const testCase of routingCases) {
    const actual = chooseRoute(testCase.question, index).paths;
    const expected = key(testCase.expectedPaths);
    const got = key(actual);
    confusion[`${expected} -> ${got}`] = (confusion[`${expected} -> ${got}`] ?? 0) + 1;
    if (expected === got) correct += 1;
    else wrong.push({ id: testCase.id, expected, actual: got });
    // Zero tolerance: a case expecting a table row that reached prose alone.
    if (testCase.expectedPaths.includes("structured") && !actual.includes("structured")) {
      structuredMissed.push(testCase.id);
    }
  }

  const accuracy = routingCases.length === 0 ? 0 : correct / routingCases.length;
  const result: RoutingResult = {
    total: routingCases.length,
    correct,
    accuracy,
    structuredMissed,
    confusion,
    wrong,
    failed: accuracy < ROUTING_FLOOR || structuredMissed.length > 0,
  };

  console.log("\n=== Router report ===");
  console.log(`  cases               ${result.total}`);
  console.log(`  accuracy            ${accuracy.toFixed(3)} (floor ${ROUTING_FLOOR})`);
  console.log(`  drug question to prose search only  ${structuredMissed.length} [zero tolerance]`);
  console.log("  confusion (expected -> actual):");
  for (const [pair, count] of Object.entries(confusion).sort()) {
    console.log(`    ${pair}  ${count}`);
  }
  if (wrong.length > 0) {
    console.log("  misrouted:");
    for (const item of wrong) console.log(`    ${item.id} expected ${item.expected}, got ${item.actual}`);
  }
  writeFileSync(
    "eval/results/routing-latest.json",
    `${JSON.stringify({ snapshotId, ...result }, null, 2)}\n`,
    "utf8",
  );
  return result;
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
