import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORPUS_SCOPE, formatPlanRef } from "../../src/corpus/scope.ts";
import type { PlanRef } from "../../src/types.ts";

interface GoldenCase {
  id: string;
  question: string;
  planRef: PlanRef;
  expect: { keyFact?: string | string[] };
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

describe("cross-plan pairs [FR-P2-06]", () => {
  const byQuestion = new Map<string, GoldenCase[]>();
  for (const testCase of golden.cases) {
    byQuestion.set(testCase.question, [...(byQuestion.get(testCase.question) ?? []), testCase]);
  }

  const pairs = [...byQuestion.values()].filter(
    (group) => new Set(group.map((c) => formatPlanRef(c.planRef))).size > 1,
  );

  it("carries at least five questions asked under more than one plan", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(5);
  });

  // A pair whose halves expect the same answer proves nothing about scoping.
  it("expects a different answer from each half of every pair", () => {
    for (const group of pairs) {
      const facts = group.map((c) => JSON.stringify(c.expect.keyFact ?? null));
      expect(new Set(facts).size, `pair "${group[0]?.question}"`).toBe(facts.length);
    }
  });

  it("crosses contracts, not just plans within one contract", () => {
    const crossContract = pairs.filter(
      (group) => new Set(group.map((c) => c.planRef.contractId)).size > 1,
    );
    expect(crossContract.length).toBeGreaterThan(0);
  });
});
