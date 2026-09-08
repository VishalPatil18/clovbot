import { describe, expect, it } from "vitest";
import { buildProvenance, chunkMarkdown, isAllowedPlanYear } from "../../src/corpus.ts";
import type { Provenance } from "../../src/types.ts";

const PROVENANCE: Provenance = {
  document: "summary_of_benefits",
  planYear: 2026,
  contractId: "H5141-001",
  section: "Medical Benefits - Specialist",
};

describe("chunkMarkdown", () => {
  const markdown = [
    "## Medical Benefits",
    "Specialist visit: $40 copay per visit.",
    "### Dermatology",
    "Dermatology: $40 copay per visit, in-network.",
  ].join("\n");

  it("splits on headers rather than on character count alone", () => {
    const chunks = chunkMarkdown(markdown, { maxChars: 500, snapshotId: "s1", provenance: PROVENANCE });
    expect(chunks).toHaveLength(2);
  });

  it("loses no content across a split", () => {
    const chunks = chunkMarkdown(markdown, { maxChars: 60, snapshotId: "s1", provenance: PROVENANCE });
    const joined = chunks.map((c) => c.text).join(" ");
    expect(joined).toContain("$40 copay per visit");
    expect(joined).toContain("Dermatology");
  });

  it("bounds chunk size", () => {
    const chunks = chunkMarkdown(markdown, { maxChars: 60, snapshotId: "s1", provenance: PROVENANCE });
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(60);
  });

  it("stamps every chunk with the snapshot id", () => {
    const chunks = chunkMarkdown(markdown, { maxChars: 500, snapshotId: "s1", provenance: PROVENANCE });
    for (const chunk of chunks) expect(chunk.snapshotId).toBe("s1");
  });

  it("is deterministic", () => {
    const options = { maxChars: 60, snapshotId: "s1", provenance: PROVENANCE };
    expect(chunkMarkdown(markdown, options)).toEqual(chunkMarkdown(markdown, options));
  });
});

describe("buildProvenance [FR-06]", () => {
  it("builds provenance from a complete record", () => {
    expect(buildProvenance({ ...PROVENANCE })).toEqual(PROVENANCE);
  });

  // Asserting on the message, not merely that something threw: a bare toThrow()
  // is satisfied by the not-implemented stub and would be falsely green.
  it("raises when plan year is missing rather than defaulting one", () => {
    const { planYear: _omitted, ...withoutYear } = PROVENANCE;
    expect(() => buildProvenance(withoutYear)).toThrow(/plan year/i);
  });

  it("raises when contract id is missing", () => {
    const { contractId: _omitted, ...withoutContract } = PROVENANCE;
    expect(() => buildProvenance(withoutContract)).toThrow(/contract id/i);
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
