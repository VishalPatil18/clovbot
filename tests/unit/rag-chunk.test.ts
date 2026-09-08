import { describe, expect, it } from "vitest";
import { chunkDocument } from "../../src/rag/chunk.ts";
import type { DocumentKind } from "../../src/types.ts";

const base = {
  documentId: "H5141-004-2026-summary_of_benefits",
  contractId: "H5141",
  planId: "004",
  planYear: 2026,
  snapshotId: "2026-09-08T0313Z",
};

const run = (text: string, kind: DocumentKind, over: Partial<typeof base> = {}) =>
  chunkDocument({ ...base, ...over, kind, text });

const SOB = [
  "SECTION II – SUMMARY OF BENEFITS",
  "Clover Health Choice (PPO)",
  "(Plan 004)",
  "Inpatient Hospital In-Network:",
  "Days 1–6: $399 copay per day",
  "Doctor’s Office In-Network:",
  "Visits Primary care physician visit: $0 copay",
  "Specialist visit: $10 copay",
].join("\n");

const EOC = [
  "CHAPTER 1: Get started as a member .........................................................................4",
  "    SECTION 1       You’re a member of Clover Health Choice .......................................4",
  "CHAPTER 4: Medical Benefits Chart",
  "SECTION 1       Your medical benefits",
  "Specialist office visits cost $10 per visit in network.",
  "SECTION 2       Rules for medical services",
  "You must use network providers except for emergencies.",
].join("\n");

const FORMULARY = [
  "ANALGESICS",
  "  OPIOID ANALGESICS, LONG-ACTING",
  "    MORPHINE SULFATE ER TABS 15mg    2    PA, QL",
  "  OPIOID ANALGESICS, SHORT-ACTING",
  "    OXYCODONE TABS 5mg    2    PA",
].join("\n");

describe("chunkDocument, provenance [FR-04]", () => {
  it("gives every chunk complete provenance", () => {
    for (const chunk of run(SOB, "summary_of_benefits")) {
      expect(chunk.contractId).toBe("H5141");
      expect(chunk.planId).toBe("004");
      expect(chunk.planYear).toBe(2026);
      expect(chunk.section.length).toBeGreaterThan(0);
      expect(chunk.snapshotId).toBe(base.snapshotId);
      expect(chunk.documentId).toBe(base.documentId);
    }
  });

  it("never emits a chunk with an empty section", () => {
    for (const kind of ["evidence_of_coverage", "formulary"] as const) {
      const text = kind === "formulary" ? FORMULARY : EOC;
      for (const chunk of run(text, kind)) expect(chunk.section.trim()).not.toBe("");
    }
  });

  it("emits no empty chunk", () => {
    expect(run(SOB, "summary_of_benefits").every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it("is deterministic", () => {
    expect(run(SOB, "summary_of_benefits")).toEqual(run(SOB, "summary_of_benefits"));
  });

  // Each plan has its own document, so ids differ by document; the plan is carried
  // as provenance rather than being the thing that makes the id unique.
  it("gives each plan's document its own chunk ids", () => {
    const a = run(SOB, "summary_of_benefits");
    const b = run(SOB, "summary_of_benefits", {
      planId: "007",
      documentId: "H5141-007-2026-summary_of_benefits",
    });
    expect(a[0]?.id).not.toBe(b[0]?.id);
    expect(a[0]?.planId).toBe("004");
    expect(b[0]?.planId).toBe("007");
  });

  it("bounds chunk size", () => {
    const long = `Big Benefit In-Network:\n${"filler line here\n".repeat(600)}`;
    for (const chunk of run(long, "summary_of_benefits")) {
      expect(chunk.content.length).toBeLessThanOrEqual(2_400);
    }
  });

  it("loses no dollar amount", () => {
    const amounts = SOB.match(/\$[\d,]+/g) ?? [];
    const kept = run(SOB, "summary_of_benefits").flatMap((c) => c.content.match(/\$[\d,]+/g) ?? []);
    for (const amount of amounts) expect(kept).toContain(amount);
  });
});

describe("chunkDocument, headings by document kind", () => {
  it("uses benefit rows as sections in a summary of benefits", () => {
    const chunks = run(SOB, "summary_of_benefits");
    const specialist = chunks.find((c) => c.content.includes("Specialist visit: $10"));
    expect(specialist?.section).toMatch(/Doctor’s Office/);
  });

  it("uses chapter and section headings in an evidence of coverage", () => {
    const chunks = run(EOC, "evidence_of_coverage");
    const benefit = chunks.find((c) => c.content.includes("Specialist office visits cost $10"));
    expect(benefit?.section).toMatch(/Medical Benefits Chart/);
    expect(benefit?.section).toMatch(/Your medical benefits/);
  });

  // The EOC's table of contents would otherwise register hundreds of fake headings.
  it("ignores table-of-contents lines with dot leaders and a page number", () => {
    const sections = new Set(run(EOC, "evidence_of_coverage").map((c) => c.section));
    for (const section of sections) {
      expect(section).not.toMatch(/\.{4,}/);
      expect(section).not.toMatch(/Get started as a member/);
    }
  });

  it("uses therapeutic class headings in a formulary, keeping the nesting", () => {
    const chunks = run(FORMULARY, "formulary");
    const morphine = chunks.find((c) => c.content.includes("MORPHINE"));
    expect(morphine?.section).toMatch(/ANALGESICS/);
    expect(morphine?.section).toMatch(/LONG-ACTING/);
  });

  it("keeps a drug row with its tier and restriction codes", () => {
    const morphine = run(FORMULARY, "formulary").find((c) => c.content.includes("MORPHINE"));
    expect(morphine?.content).toMatch(/PA, QL/);
  });
});

describe("chunkDocument, contextual prefixes [D-006]", () => {
  it("prefixes every chunk with its document, plan and section", () => {
    for (const chunk of run(SOB, "summary_of_benefits")) {
      expect(chunk.contextPrefix).toContain("H5141-004");
      expect(chunk.contextPrefix).toContain("2026");
      expect(chunk.contextPrefix.length).toBeGreaterThan(0);
    }
  });

  it("names the section in the prefix so an orphan amount is not context-free", () => {
    const specialist = run(SOB, "summary_of_benefits").find((c) =>
      c.content.includes("Specialist visit: $10"),
    );
    expect(specialist?.contextPrefix).toMatch(/Doctor’s Office/);
  });

  // Decision: headings carry the context deterministically; the model is only
  // asked for chunks that have no heading to inherit.
  it("flags a chunk with no heading for generated context", () => {
    const orphan = run("The copay is $0.", "summary_of_benefits");
    expect(orphan[0]?.needsGeneratedContext).toBe(true);
  });

  it("does not ask for generated context when a heading exists", () => {
    const chunks = run(SOB, "summary_of_benefits");
    const specialist = chunks.find((c) => c.content.includes("Specialist visit: $10"));
    expect(specialist?.needsGeneratedContext).toBe(false);
  });

  it("embeds the prefix with the content so retrieval sees both", () => {
    const specialist = run(SOB, "summary_of_benefits").find((c) =>
      c.content.includes("Specialist visit: $10"),
    );
    expect(specialist?.embedText).toContain(specialist?.contextPrefix ?? "");
    expect(specialist?.embedText).toContain("Specialist visit: $10 copay");
  });
});
