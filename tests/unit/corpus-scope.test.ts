import { describe, expect, it } from "vitest";
import { CORPUS_SCOPE, formatPlanRef, isSamePlan } from "../../src/corpus/scope.ts";

describe("corpus scope", () => {
  it("declares at least one plan", () => {
    expect(CORPUS_SCOPE.plans.length).toBeGreaterThan(0);
  });

  it("has no duplicate plan references", () => {
    const keys = CORPUS_SCOPE.plans.map(formatPlanRef);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every plan a well-formed contract, plan and year", () => {
    for (const ref of CORPUS_SCOPE.plans) {
      expect(ref.contractId).toMatch(/^[A-Z]\d{4}$/);
      expect(ref.planId).toMatch(/^\d{3}$/);
      expect(Number.isInteger(ref.planYear)).toBe(true);
    }
  });

  it("scopes every plan to the snapshot's plan year", () => {
    for (const ref of CORPUS_SCOPE.plans) {
      expect(ref.planYear).toBe(CORPUS_SCOPE.planYear);
    }
  });

  it("formats a reference as contract-plan, never bare plan", () => {
    expect(formatPlanRef({ contractId: "H8010", planId: "002", planYear: 2026 })).toBe("H8010-002");
  });

  it("matches on both halves, so a plan id alone cannot collide across contracts", () => {
    const a = { contractId: "H5141", planId: "002", planYear: 2026 };
    const b = { contractId: "H8010", planId: "002", planYear: 2026 };
    expect(isSamePlan(a, b)).toBe(false);
    expect(isSamePlan(a, { ...a })).toBe(true);
  });
});
