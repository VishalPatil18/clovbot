import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkStructuralCitations } from "../../eval/harness/score.ts";

interface Fixture {
  label: string;
  answer: string;
  expect: { structuralCompliant?: boolean };
}

const { fixtures } = JSON.parse(
  readFileSync("tests/fixtures/answers/judge-fixtures.json", "utf8"),
) as { fixtures: Fixture[] };

// These four prove the harness detects what it claims to. If they misbehave,
// every number the harness later reports is meaningless.
describe("judge fixtures, structural half", () => {
  for (const fixture of fixtures) {
    const expected = fixture.expect.structuralCompliant;
    if (expected === undefined) continue;
    it(`${fixture.label}: structural compliance is ${expected}`, () => {
      expect(checkStructuralCitations(fixture.answer).compliant).toBe(expected);
    });
  }

  it("covers known-good, uncited, unfaithful, partial and refusal fixtures", () => {
    expect(fixtures.map((f) => f.label).sort()).toEqual([
      "correct refusal",
      "faithful multi-claim",
      "known good",
      "partially faithful",
      "uncited",
      "unfaithful",
    ]);
  });
});
