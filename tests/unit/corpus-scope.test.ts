import { describe, expect, it } from "vitest";
import {
  CORPUS_SCOPE,
  defaultContractId,
  defaultPlanRef,
  findPlanRef,
  formatPlanRef,
  isSamePlan,
  planDisplayName,
  resolveIndexedPlan,
} from "../../src/corpus/scope.ts";


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

describe("plan resolution [D-049, D-055]", () => {
  it("refuses a plan id that belongs to another contract", () => {
    expect(findPlanRef("H8010", "004")).toBeNull();
    expect(findPlanRef("H5141", "002")).toBeNull();
    expect(findPlanRef("H9999", "001")).toBeNull();
  });

  it("resolves a plan the corpus actually covers", () => {
    expect(findPlanRef("H5141", "004")).toEqual({
      contractId: "H5141",
      planId: "004",
      planYear: 2026,
    });
  });

  it("names every declared plan, so no member reads a contract number", () => {
    for (const ref of CORPUS_SCOPE.plans) {
      expect(planDisplayName(ref)).not.toMatch(/^[A-Z]\d{4}/);
    }
  });

  it("raises rather than rendering an id when a plan has no name", () => {
    expect(() => planDisplayName({ contractId: "H0000", planId: "999", planYear: 2026 })).toThrow(
      /no display name/,
    );
  });

  it("defaults to the first declared plan", () => {
    expect(defaultPlanRef()).toEqual(CORPUS_SCOPE.plans[0]);
    expect(defaultContractId()).toBe(CORPUS_SCOPE.plans[0]?.contractId);
  });
});

describe("resolveIndexedPlan [FR-P2-02, D-055]", () => {
  const indexed = [
    { contractId: "H5141", id: "004", planYear: 2026, name: "Clover Health Choice (PPO)" },
    { contractId: "H8010", id: "002", planYear: 2026, name: "Clover Health Classic (HMO)" },
  ];

  it("resolves a plan the index actually holds", () => {
    expect(resolveIndexedPlan(indexed, "H8010", "002")).toMatchObject({
      contractId: "H8010",
      planId: "002",
    });
  });

  // Today's silent failure: an unknown plan retrieves nothing and reads as a refusal.
  it("refuses a plan the index does not hold", () => {
    expect(resolveIndexedPlan(indexed, "H5141", "007")).toBeNull();
    expect(resolveIndexedPlan(indexed, "H9999", "004")).toBeNull();
  });

  it("refuses a plan id borrowed from the other contract", () => {
    expect(resolveIndexedPlan(indexed, "H5141", "002")).toBeNull();
    expect(resolveIndexedPlan(indexed, "H8010", "004")).toBeNull();
  });

  it("falls back to the first indexed contract when the request names none", () => {
    expect(resolveIndexedPlan(indexed, null, "004")).toMatchObject({ contractId: "H5141" });
    expect(resolveIndexedPlan(indexed, null, "002")).toBeNull();
  });
});
