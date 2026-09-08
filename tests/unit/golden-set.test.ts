import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORPUS_SCOPE, formatPlanRef } from "../../src/corpus/scope.ts";
import type { PlanRef } from "../../src/types.ts";

interface GoldenCase {
  id: string;
  planRef: PlanRef;
}

const golden = JSON.parse(readFileSync("eval/golden/golden-set.json", "utf8")) as {
  cases: GoldenCase[];
};

describe("golden set plan references", () => {
  it("gives every case a structured plan reference", () => {
    for (const testCase of golden.cases) {
      expect(testCase.planRef, `case ${testCase.id}`).toBeDefined();
      expect(typeof testCase.planRef.contractId).toBe("string");
      expect(typeof testCase.planRef.planId).toBe("string");
      expect(Number.isInteger(testCase.planRef.planYear)).toBe(true);
    }
  });

  // A typo'd contract retrieves nothing and reads as a model refusal, not a bad case.
  it("only references plans the corpus scope declares", () => {
    const indexed = new Set(CORPUS_SCOPE.plans.map(formatPlanRef));
    for (const testCase of golden.cases) {
      expect(indexed, `case ${testCase.id}`).toContain(formatPlanRef(testCase.planRef));
    }
  });

  it("carries no top-level contract id, which would hide the per-case reference", () => {
    const raw = JSON.parse(readFileSync("eval/golden/golden-set.json", "utf8")) as Record<string, unknown>;
    expect(raw["contractId"]).toBeUndefined();
  });
});
