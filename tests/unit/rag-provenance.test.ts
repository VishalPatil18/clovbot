import { describe, expect, it } from "vitest";
import { buildProvenance, isAllowedPlanYear } from "../../src/rag/provenance.ts";
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
