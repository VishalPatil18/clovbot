import { parseCitations } from "../../src/rag/prompt.ts";

export type Bucket = "A" | "B" | "C" | "adversarial";

/** NFR-QUAL-03. Lowering the floor to improve this number is prohibited. */
export const REFUSAL_BANDS = { investigate: 0.2, fail: 0.35 } as const;
export const FAITHFULNESS_FLOOR = 0.9;

export type RefusalVerdict = "ok" | "investigate" | "fail";

export function refusalVerdict(rate: number): RefusalVerdict {
  if (rate > REFUSAL_BANDS.fail) return "fail";
  if (rate > REFUSAL_BANDS.investigate) return "investigate";
  return "ok";
}

/**
 * A sentence stating a fact about the plan must carry a citation. Questions,
 * hedges and the escalation script are not factual claims about coverage.
 */
const FACTUAL = /\$[\d,]|\b\d+\s*(%|percent|days?|visits?)\b|\btier\s*\d|\bcovered\b|\bcopay\b|\bcoinsurance\b|\bdeductible\b/i;
const ESCALATION = /call|tty|member services|speak (to|with)|representative|1-\d{3}/i;

export interface StructuralResult {
  compliant: boolean;
  uncitedSentences: string[];
}

/** Deterministic. NFR-QUAL-02 is a hard build gate, separate from the judge. */
export function checkStructuralCitations(answer: string): StructuralResult {
  const uncited = splitSentences(answer).filter(
    (sentence) =>
      FACTUAL.test(sentence) && !ESCALATION.test(sentence) && parseCitations(sentence).length === 0,
  );
  return { compliant: uncited.length === 0, uncitedSentences: uncited };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export interface CaseOutcome {
  id: string;
  /** Kept so a failing number can be diagnosed without re-running the model. */
  answer?: string;
  bucket: Bucket;
  driver: string;
  /** False when the behaviour is specified but not yet enforced by the build. */
  enforced: boolean;
  passed: boolean;
  refused: boolean;
  faithfulness: number | null;
  structural: StructuralResult;
  note: string;
}

export interface BucketScore {
  bucket: Bucket;
  total: number;
  enforced: number;
  passed: number;
  accuracy: number | null;
}

export function scoreByBucket(outcomes: CaseOutcome[]): BucketScore[] {
  const buckets: Bucket[] = ["A", "B", "C", "adversarial"];
  return buckets.map((bucket) => {
    const all = outcomes.filter((outcome) => outcome.bucket === bucket);
    const enforced = all.filter((outcome) => outcome.enforced);
    const passed = enforced.filter((outcome) => outcome.passed).length;
    return {
      bucket,
      total: all.length,
      enforced: enforced.length,
      passed,
      accuracy: enforced.length === 0 ? null : passed / enforced.length,
    };
  });
}

/** Upstream failures are excluded from the refusal rate. FR-25. */
export function refusalRate(outcomes: CaseOutcome[]): number {
  const answerable = outcomes.filter((outcome) => outcome.bucket === "A");
  if (answerable.length === 0) return 0;
  return answerable.filter((outcome) => outcome.refused).length / answerable.length;
}

export function meanFaithfulness(outcomes: CaseOutcome[]): number | null {
  const scored = outcomes
    .map((outcome) => outcome.faithfulness)
    .filter((score): score is number => score !== null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, score) => sum + score, 0) / scored.length;
}

export interface Report {
  faithfulness: number | null;
  structuralCompliance: number;
  refusalRate: number;
  refusalVerdict: RefusalVerdict;
  buckets: BucketScore[];
  failures: string[];
}

export function buildReport(outcomes: CaseOutcome[]): Report {
  const rate = refusalRate(outcomes);
  const faithfulness = meanFaithfulness(outcomes);
  const structural =
    outcomes.length === 0
      ? 1
      : outcomes.filter((outcome) => outcome.structural.compliant).length / outcomes.length;

  const failures: string[] = [];
  if (faithfulness !== null && faithfulness < FAITHFULNESS_FLOOR) {
    failures.push(`faithfulness ${faithfulness.toFixed(3)} is below ${FAITHFULNESS_FLOOR}`);
  }
  const uncited = outcomes.filter((outcome) => !outcome.structural.compliant).length;
  if (uncited > 0) {
    failures.push(`${uncited} answers carry an uncited factual claim`);
  }
  if (refusalVerdict(rate) === "fail") {
    failures.push(`refusal rate ${(rate * 100).toFixed(1)}% exceeds ${REFUSAL_BANDS.fail * 100}%`);
  }

  return {
    faithfulness,
    structuralCompliance: structural,
    refusalRate: rate,
    refusalVerdict: refusalVerdict(rate),
    buckets: scoreByBucket(outcomes),
    failures,
  };
}
