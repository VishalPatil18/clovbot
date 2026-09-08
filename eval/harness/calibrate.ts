/**
 * Calibrates the faithfulness judge. NFR-QUAL-01 requires a hand-checked sample,
 * because an uncalibrated judge makes every faithfulness number it produces
 * unfalsifiable. Output is committed so the numbers can be cited later.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { judgeFaithfulness } from "../judges/faithfulness.ts";

interface Fixture {
  label: string;
  answer: string;
  expect: { faithfulnessAtLeast?: number; faithfulnessBelow?: number };
}

const { sources, fixtures } = JSON.parse(
  readFileSync("tests/fixtures/answers/judge-fixtures.json", "utf8"),
) as { sources: { id: string; content: string }[]; fixtures: Fixture[] };

const rows: {
  label: string;
  score: number;
  expected: string;
  agrees: boolean;
  sentences: { sentence: string; supported: boolean; reason: string }[];
}[] = [];

for (const fixture of fixtures) {
  const judged = await judgeFaithfulness(fixture.answer, sources);
  const atLeast = fixture.expect.faithfulnessAtLeast;
  const below = fixture.expect.faithfulnessBelow;

  const expected =
    atLeast !== undefined ? `>= ${atLeast}` : below !== undefined ? `< ${below}` : "unconstrained";
  const agrees =
    (atLeast === undefined || judged.score >= atLeast) && (below === undefined || judged.score < below);

  rows.push({ label: fixture.label, score: judged.score, expected, agrees, sentences: judged.sentences });
  console.log(`  ${agrees ? "agrees " : "DISAGREES"} ${fixture.label.padEnd(18)} score ${judged.score.toFixed(2)} expected ${expected}`);
  for (const sentence of judged.sentences) {
    console.log(`      ${sentence.supported ? "ok " : "no "} ${sentence.sentence.slice(0, 72)}`);
    if (!sentence.supported) console.log(`           reason: ${sentence.reason.slice(0, 90)}`);
  }
}

const handChecked = rows.reduce((sum, row) => sum + row.sentences.length, 0);
const disagreements = rows.filter((row) => !row.agrees);

console.log(`\n  ${handChecked} sentence-level judgements across ${rows.length} fixtures`);
console.log(`  ${disagreements.length} fixture-level disagreements`);

mkdirSync("eval/results", { recursive: true });
writeFileSync(
  "eval/results/judge-calibration.json",
  `${JSON.stringify({ ranAt: new Date().toISOString(), handChecked, rows }, null, 2)}\n`,
  "utf8",
);
console.log("  written to eval/results/judge-calibration.json");

if (disagreements.length > 0) process.exit(1);
