import { describe, expect, it } from "vitest";
import {
  buildReport,
  checkStructuralCitations,
  refusalRate,
  refusalVerdict,
  scoreByBucket,
  type CaseOutcome,
} from "../../eval/harness/score.ts";

const outcome = (over: Partial<CaseOutcome>): CaseOutcome => ({
  id: "c1",
  bucket: "A",
  driver: "A-02",
  enforced: true,
  passed: true,
  refused: false,
  faithfulness: 1,
  structural: { compliant: true, uncitedSentences: [] },
  note: "",
  language: "en" as const,
  ...over,
});

describe("checkStructuralCitations [NFR-QUAL-02]", () => {
  it("passes a cited factual claim", () => {
    const result = checkStructuralCitations("The specialist copay is $10 [sob-doctor-01].");
    expect(result.compliant).toBe(true);
  });

  // The deliberately uncited fixture the acceptance criteria require.
  it("fails an uncited factual claim", () => {
    const result = checkStructuralCitations("The specialist copay is $10.");
    expect(result.compliant).toBe(false);
    expect(result.uncitedSentences).toHaveLength(1);
  });

  it("names the offending sentence", () => {
    const result = checkStructuralCitations(
      "Your copay is $10 [a-01]. Your deductible is $200.",
    );
    expect(result.uncitedSentences[0]).toContain("$200");
  });

  it("does not demand a citation on the escalation script", () => {
    const result = checkStructuralCitations(
      "I could not find that. Please call Member Services at 1-888-778-1478 (TTY 711).",
    );
    expect(result.compliant).toBe(true);
  });

  it("does not demand a citation on a plain refusal", () => {
    expect(checkStructuralCitations("That is not in the documents I searched.").compliant).toBe(true);
  });

  it("catches an uncited tier claim", () => {
    expect(checkStructuralCitations("Atorvastatin is tier 1.").compliant).toBe(false);
  });

  it("catches an uncited coverage claim", () => {
    expect(checkStructuralCitations("Hearing aids are covered.").compliant).toBe(false);
  });
});

describe("refusalVerdict [NFR-QUAL-03]", () => {
  it("is ok at or below 20%", () => {
    expect(refusalVerdict(0.2)).toBe("ok");
  });

  it("investigates above 20%", () => {
    expect(refusalVerdict(0.25)).toBe("investigate");
  });

  it("fails above 35%", () => {
    expect(refusalVerdict(0.36)).toBe("fail");
  });
});

describe("refusalRate", () => {
  it("measures refusals among answerable questions only", () => {
    const rate = refusalRate([
      outcome({ bucket: "A", refused: true }),
      outcome({ bucket: "A", refused: false }),
      outcome({ bucket: "C", refused: true }),
      outcome({ bucket: "C", refused: true }),
    ]);
    expect(rate).toBe(0.5);
  });

  it("is zero when nothing is answerable", () => {
    expect(refusalRate([outcome({ bucket: "C", refused: true })])).toBe(0);
  });
});

describe("scoreByBucket", () => {
  // Bucket B and C behaviour is specified but not enforced until Stage 6's floor.
  it("excludes not-yet-enforced cases from accuracy", () => {
    const scores = scoreByBucket([
      outcome({ bucket: "C", enforced: false, passed: false }),
      outcome({ bucket: "C", enforced: true, passed: true }),
    ]);
    const c = scores.find((score) => score.bucket === "C");
    expect(c?.total).toBe(2);
    expect(c?.enforced).toBe(1);
    expect(c?.accuracy).toBe(1);
  });

  it("reports no accuracy when nothing in the bucket is enforced", () => {
    const scores = scoreByBucket([outcome({ bucket: "B", enforced: false })]);
    expect(scores.find((score) => score.bucket === "B")?.accuracy).toBeNull();
  });
});

describe("buildReport", () => {
  it("fails the build when faithfulness is below 0.90", () => {
    const report = buildReport([outcome({ faithfulness: 0.8 })]);
    expect(report.failures.some((failure) => failure.includes("faithfulness"))).toBe(true);
  });

  it("passes at exactly 0.90", () => {
    const report = buildReport([outcome({ faithfulness: 0.9 })]);
    expect(report.failures.some((failure) => failure.includes("faithfulness"))).toBe(false);
  });

  it("fails the build on any uncited factual claim", () => {
    const report = buildReport([
      outcome({ structural: { compliant: false, uncitedSentences: ["The copay is $10."] } }),
    ]);
    expect(report.failures.some((failure) => failure.includes("uncited"))).toBe(true);
  });

  it("fails the build when the refusal rate exceeds 35%", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      outcome({ id: `c${i}`, bucket: "A", refused: i < 4 }),
    );
    const report = buildReport(many);
    expect(report.refusalVerdict).toBe("fail");
    expect(report.failures.some((failure) => failure.includes("refusal"))).toBe(true);
  });

  it("does not fail the build at an investigate-level refusal rate", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      outcome({ id: `c${i}`, bucket: "A", refused: i < 3 }),
    );
    const report = buildReport(many);
    expect(report.refusalVerdict).toBe("investigate");
    expect(report.failures.some((failure) => failure.includes("refusal"))).toBe(false);
  });

  it("reports a clean run with no failures", () => {
    expect(buildReport([outcome({})]).failures).toEqual([]);
  });
});
