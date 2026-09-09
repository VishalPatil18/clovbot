import { describe, expect, it } from "vitest";
import { memberFactAsChunk, type MemberRecord } from "../../src/members/store.ts";
import { citationLabel } from "../../src/rag/payload.ts";

const record: MemberRecord = {
  id: 1,
  contractId: "H5141",
  planId: "004",
  planYear: 2026,
  facts: [],
};

const chunk = memberFactAsChunk(record, {
  item: "Claim CLM-0031",
  field: "What you owe",
  text: "Billed $210, the plan paid $200, and $10 is owed.",
  sources: [{ table: "member_claims", column: "member_owes", rowId: "CLM-0031" }],
});

describe("member record as a citable source [FR-P2-28, D-080, D-082]", () => {
  // Same three-part shape as a document citation, so a combined answer
  // reads as one list rather than two vocabularies.
  it("names the record, the item and the field", () => {
    expect(citationLabel(chunk)).toBe("Your member record · Claim CLM-0031 · What you owe");
  });

  it("says the field in words a member would use, not a column name", () => {
    expect(citationLabel(chunk)).not.toMatch(/member_owes|_/);
  });

  // The label is visible in output, not only present in the schema.
  it("marks the content as synthetic wherever it is read", () => {
    expect(chunk.content).toMatch(/synthetic/i);
  });

  // An exact record field is not a ranked guess, so the floor must not refuse it.
  it("outranks the confidence floor", () => {
    expect(chunk.rerankScore).toBe(1);
  });

  it("carries the member's own plan, so a citation cannot claim another plan", () => {
    expect(chunk.contractId).toBe("H5141");
    expect(chunk.planId).toBe("004");
    expect(chunk.planYear).toBe(2026);
  });

  it("gives every fact a distinct id", () => {
    const other = memberFactAsChunk(record, {
      item: "Claim CLM-0031",
      field: "Status",
      text: "Paid.",
      sources: [{ table: "member_claims", column: "status", rowId: "CLM-0031" }],
    });
    expect(other.id).not.toBe(chunk.id);
  });
});
