import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalog, parseCounties, selectPlanDocuments } from "../../src/corpus/discover.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(`tests/fixtures/corpus/live/${name}.json`, "utf8"));

const COUNTY_SCOPED = fixture("document-search-34017-2026");
const UNFILTERED = fixture("document-search-unfiltered");
const COUNTIES = fixture("counties-07302");

const SCOPE = { planYear: 2026, stateAbbrev: "NJ" } as const;
const PLAN = { contractId: "H5141", planId: "004" } as const;

describe("parseCounties", () => {
  it("resolves a zipcode to its FIPS county", () => {
    expect(parseCounties(COUNTIES)).toEqual([
      { zipcode: "07302", fipsCountyId: "34017", countyName: "Hudson County", stateAbbrev: "NJ" },
    ]);
  });

  it("rejects a response that is not an array", () => {
    expect(() => parseCounties({ zipcode: "07302" })).toThrow(/expected an array/i);
  });

  it("rejects an entry missing its FIPS county id", () => {
    expect(() => parseCounties([{ zipcode: "07302", state_abbrev: "NJ" }])).toThrow(
      /fips_county_id/,
    );
  });

  it("rejects an empty result rather than returning nothing usable", () => {
    expect(() => parseCounties([])).toThrow(/no county/i);
  });
});

describe("parseCatalog", () => {
  it("parses the county-scoped catalog into typed plans", () => {
    const plans = parseCatalog(COUNTY_SCOPED, SCOPE);
    expect(plans).toHaveLength(6);
    const choice = plans.find((p) => p.planId === "004");
    expect(choice).toMatchObject({
      contractId: "H5141",
      planId: "004",
      year: 2026,
      networkType: "PPO",
      rxCoverage: true,
    });
  });

  // D-030: zipcode= is accepted and silently ignored, so a wrong parameter
  // returns every state with no error. This is the guard for that.
  it("rejects a catalog carrying plans outside the requested state", () => {
    expect(() => parseCatalog(UNFILTERED, SCOPE)).toThrow(/not county-scoped/i);
  });

  it("names the offending states so the failure is diagnosable", () => {
    expect(() => parseCatalog(UNFILTERED, SCOPE)).toThrow(/tx|ga|pa|sc/i);
  });

  // FR-01: out-of-year documents are rejected at ingest, not filtered at query time.
  it("rejects a plan from a different plan year", () => {
    const stale = { results: [{ ...(COUNTY_SCOPED as never as CatalogShape).results[0], year: "2025" }] };
    expect(() => parseCatalog(stale, SCOPE)).toThrow(/2025/);
  });

  it("rejects a response with no results key", () => {
    expect(() => parseCatalog({}, SCOPE)).toThrow(/results/);
  });

  it("rejects a plan missing its contract id", () => {
    const broken = { results: [{ plan_id: "004", year: "2026", documents: {} }] };
    expect(() => parseCatalog(broken, SCOPE)).toThrow(/contract_id/);
  });
});

describe("selectPlanDocuments", () => {
  const plans = parseCatalog(COUNTY_SCOPED, SCOPE);

  it("returns the English documents for the selected plan", () => {
    const docs = selectPlanDocuments(plans, PLAN).filter((d) => d.language === "english");
    const kinds = docs.map((d) => d.kind).sort();
    expect(kinds).toEqual([
      "annual_notice_of_change",
      "evidence_of_coverage",
      "summary_of_benefits",
    ]);
  });

  // FR-P3-31. Clover publishes these three in Spanish and no formulary.
  it("returns the Spanish set alongside it", () => {
    const spanish = selectPlanDocuments(plans, PLAN).filter((d) => d.language === "spanish");
    expect(spanish.map((d) => d.kind).sort()).toEqual([
      "annual_notice_of_change",
      "evidence_of_coverage",
      "summary_of_benefits",
    ]);
  });

  // Without it the Spanish EOC would overwrite the English one on disk.
  it("gives the two languages different document ids", () => {
    const docs = selectPlanDocuments(plans, PLAN);
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
    expect(docs.filter((d) => d.language === "spanish").every((d) => d.id.endsWith("-es"))).toBe(true);
  });

  it("stamps every document with the provenance a citation needs", () => {
    const eoc = selectPlanDocuments(plans, PLAN)
      .filter((d) => d.language === "english")
      .find((d) => d.kind === "evidence_of_coverage");
    expect(eoc).toMatchObject({
      contractId: "H5141",
      planId: "004",
      planYear: 2026,
      language: "english",
    });
    expect(eoc?.url).toMatch(/^https:\/\/cdn\.cloverhealth\.com\/.+\.pdf$/);
  });

  it("gives each document a stable human-readable id", () => {
    const docs = selectPlanDocuments(plans, PLAN);
    expect(docs.map((d) => d.id)).toContain("H5141-004-2026-evidence_of_coverage");
  });

  it("throws when the requested plan is absent rather than returning an empty set", () => {
    expect(() => selectPlanDocuments(plans, { contractId: "H5141", planId: "999" })).toThrow(
      /H5141-999/,
    );
  });
});

interface CatalogShape {
  results: Record<string, unknown>[];
}
