import { describe, expect, it } from "vitest";
import { buildProvenance, isAllowedPlanYear, isInPlanScope } from "../../src/rag/provenance.ts";
import type { Provenance } from "../../src/types.ts";

const PROVENANCE: Provenance = {
  document: "summary_of_benefits",
  planYear: 2026,
  contractId: "H5141",
  planId: "004",
  section: "Doctor’s Office",
};

describe("buildProvenance [FR-04, FR-06]", () => {
  it("builds provenance from a complete record", () => {
    expect(buildProvenance({ ...PROVENANCE })).toEqual(PROVENANCE);
  });

  // Asserting on the message, not merely that something threw: a bare toThrow()
  // is satisfied by a not-implemented stub and would be falsely green.
  it("raises when plan year is missing rather than defaulting one", () => {
    const { planYear: _omitted, ...rest } = PROVENANCE;
    expect(() => buildProvenance(rest)).toThrow(/plan year/i);
  });

  it("raises when contract id is missing", () => {
    const { contractId: _omitted, ...rest } = PROVENANCE;
    expect(() => buildProvenance(rest)).toThrow(/contract id/i);
  });

  // D-033: contract alone does not identify a plan, and the two plans differ on price.
  it("raises when plan id is missing", () => {
    const { planId: _omitted, ...rest } = PROVENANCE;
    expect(() => buildProvenance(rest)).toThrow(/plan id/i);
  });

  it("raises when section is missing", () => {
    const { section: _omitted, ...rest } = PROVENANCE;
    expect(() => buildProvenance(rest)).toThrow(/section/i);
  });

  it("raises on an unknown document kind", () => {
    expect(() => buildProvenance({ ...PROVENANCE, document: "invoice" })).toThrow(/document/i);
  });

  it("accepts a corpus-wide document with no plan of its own", () => {
    const shared = { ...PROVENANCE, document: "formulary", planId: "*" };
    expect(buildProvenance(shared).planId).toBe("*");
  });
});

describe("isAllowedPlanYear [FR-01]", () => {
  it("accepts the configured year", () => {
    expect(isAllowedPlanYear(2026, 2026)).toBe(true);
  });

  it("rejects an earlier year", () => {
    expect(isAllowedPlanYear(2025, 2026)).toBe(false);
  });

  it("rejects a later year", () => {
    expect(isAllowedPlanYear(2027, 2026)).toBe(false);
  });

  it("rejects a missing or malformed year", () => {
    expect(isAllowedPlanYear(undefined, 2026)).toBe(false);
    expect(isAllowedPlanYear("2026", 2026)).toBe(false);
    expect(isAllowedPlanYear(Number.NaN, 2026)).toBe(false);
  });
});

describe("isInPlanScope [FR-P2-03, D-056]", () => {
  const scope = { contractId: "H8010", planId: "002", planYear: 2026 };

  it("accepts a row from the session's own plan", () => {
    expect(isInPlanScope(scope, { contractId: "H8010", planId: "002", planYear: 2026 })).toBe(true);
  });

  it("accepts a contract-wide row, which answers under every plan", () => {
    expect(isInPlanScope(scope, { contractId: "*", planId: "*", planYear: 2026 })).toBe(true);
  });

  // The failure this stage exists to prevent: another plan's copay, stated confidently.
  it("rejects another plan on the same contract", () => {
    expect(isInPlanScope(scope, { contractId: "H8010", planId: "003", planYear: 2026 })).toBe(false);
  });

  it("rejects the same plan id on a different contract", () => {
    expect(isInPlanScope(scope, { contractId: "H5141", planId: "002", planYear: 2026 })).toBe(false);
  });

  it("rejects a row from another plan year", () => {
    expect(isInPlanScope(scope, { contractId: "H8010", planId: "002", planYear: 2025 })).toBe(false);
  });

  it("rejects a plan-wildcard row whose contract is a different real contract", () => {
    expect(isInPlanScope(scope, { contractId: "H5141", planId: "*", planYear: 2026 })).toBe(false);
  });
});
