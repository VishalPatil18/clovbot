import { describe, expect, it } from "vitest";
import { chunkSummaryOfBenefits } from "../../src/rag/chunk.ts";

const SCOPE = {
  documentId: "H5141-004-2026-summary_of_benefits",
  contractId: "H5141",
  planId: "004",
  planYear: 2026,
  snapshotId: "2026-09-08T0313Z",
};

const SOURCE = [
  "SECTION II – SUMMARY OF BENEFITS",
  "Clover Health Choice (PPO)",
  "(Plan 004)",
  "Inpatient Hospital In-Network:",
  "Days 1–6: $399 copay per day",
  "Out-of-Network:",
  "Days 1–6: $549 copay per day",
  "Doctor’s Office In-Network:",
  "Visits Primary care physician visit: $0 copay",
  "Specialist visit: $10 copay",
  "Emergency Care In-Network and Out-of-Network:",
  "$115 copay per visit.",
].join("\n");

describe("chunkSummaryOfBenefits", () => {
  const chunks = chunkSummaryOfBenefits(SOURCE, SCOPE);

  it("produces chunks", () => {
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("stamps every chunk with the provenance a citation needs", () => {
    for (const chunk of chunks) {
      expect(chunk.contractId).toBe("H5141");
      expect(chunk.planId).toBe("004");
      expect(chunk.planYear).toBe(2026);
      expect(chunk.snapshotId).toBe("2026-09-08T0313Z");
      expect(chunk.documentId).toBe(SCOPE.documentId);
    }
  });

  // FR-06: a citation without a plan year is not a citation, so no chunk may lack one.
  it("never emits a chunk without a plan year", () => {
    expect(chunks.every((c) => Number.isInteger(c.planYear))).toBe(true);
  });

  it("gives each chunk a section naming the benefit it covers", () => {
    const specialist = chunks.find((c) => c.content.includes("Specialist visit: $10"));
    expect(specialist?.section).toMatch(/Doctor’s Office/);
  });

  it("keeps a benefit's amounts with its heading", () => {
    const specialist = chunks.find((c) => c.content.includes("Specialist visit: $10"));
    expect(specialist?.content).toContain("Primary care physician visit: $0 copay");
  });

  it("gives chunk ids that are stable across runs", () => {
    const again = chunkSummaryOfBenefits(SOURCE, SCOPE);
    expect(again.map((c) => c.id)).toEqual(chunks.map((c) => c.id));
  });

  it("makes chunk ids readable rather than hashes", () => {
    expect(chunks[0]?.id).toContain("H5141-004-2026");
  });

  it("gives chunks from different plans different ids", () => {
    const other = chunkSummaryOfBenefits(SOURCE, { ...SCOPE, planId: "007" });
    expect(other[0]?.id).not.toEqual(chunks[0]?.id);
  });

  it("loses no dollar amount from the source", () => {
    const inSource = SOURCE.match(/\$[\d,]+/g) ?? [];
    const inChunks = chunks.flatMap((c) => c.content.match(/\$[\d,]+/g) ?? []);
    for (const amount of inSource) expect(inChunks).toContain(amount);
  });

  it("emits no empty chunk", () => {
    expect(chunks.every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it("splits a section that runs past the size limit", () => {
    const long = `Big Benefit In-Network:\n${"filler line here\n".repeat(400)}`;
    const split = chunkSummaryOfBenefits(long, SCOPE);
    expect(split.length).toBeGreaterThan(1);
    for (const chunk of split) expect(chunk.content.length).toBeLessThanOrEqual(2_400);
  });

  it("carries the section heading onto every part of a split section", () => {
    const long = `Big Benefit In-Network:\n${"filler line here\n".repeat(400)}`;
    const split = chunkSummaryOfBenefits(long, SCOPE);
    for (const chunk of split) expect(chunk.section).toBe("Big Benefit");
  });
});
