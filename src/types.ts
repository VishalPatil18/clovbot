export type DocumentKind =
  | "evidence_of_coverage"
  | "summary_of_benefits"
  | "annual_notice_of_change"
  | "formulary"
  | "provider_directory"
  | "pharmacy_directory"
  | "corporate";

/**
 * Which benefit package a caller is scoping to. Contract and plan travel together
 * because plan ids repeat across contracts: H5141-002 and H8010-002 are different
 * plans, and a bare "002" cannot tell them apart. D-049, D-054.
 */
export interface PlanRef {
  contractId: string;
  planId: string;
  planYear: number;
}

/**
 * What a citation can point at. A member's own record is citable but is not a
 * corpus document: it has no byte floor, no snapshot and no plan year of its
 * own, so it widens the citation layer rather than DocumentKind. D-080.
 */
export type CitableKind = DocumentKind | "member_record";

/** A citation without a plan year is not a valid citation. FR-06. */
export interface Provenance {
  document: DocumentKind;
  planYear: number;
  contractId: string;
  /** Contract alone does not identify a plan, and two plans differ on price. D-033. */
  planId: string;
  section: string;
}

export interface Chunk {
  id: string;
  text: string;
  /** Generated at ingest and frozen into fixtures so tests stay deterministic. D-006. */
  contextPrefix: string;
  provenance: Provenance;
  snapshotId: string;
}

export interface RankedChunk {
  id: string;
  score: number;
}

export type GateOutcome =
  | { kind: "answer" }
  | { kind: "refuse"; reason: "below_floor" };

export type RefusalTrigger =
  | "C-01" | "C-02" | "C-03" | "C-04" | "C-05"
  | "C-06" | "C-07" | "C-08" | "C-09" | "C-10"
  | "requires_member_data"
  | "unsupported_language";

export interface Claim {
  text: string;
  citationIds: string[];
}

export interface Refusal {
  trigger: RefusalTrigger;
  explanation: string;
  humanPathOffered: boolean;
}

/** FR-32. Claims carry their own citations, so an uncited claim cannot be represented. */
/**
 * The one number a cost answer is about, rendered as the dominant element. Cited
 * like a claim, because the largest thing on the screen cannot be uncited. D-064.
 */
export interface Headline {
  /** What the amount measures. "$10" alone does not say copay or deductible. */
  label: string;
  amount: string;
  citationIds: string[];
}

export interface AnswerPayload {
  claims: Claim[];
  /** Null when the answer is not a single amount, which is the prose path. D-065. */
  headline: Headline | null;
  unanswered: string[];
  refusal: Refusal | null;
}

export type ValidationResult =
  | { ok: true; value: AnswerPayload }
  | { ok: false; errors: string[] };

export interface TurnLog {
  id: string;
  /** Redacted per FR-31. Raw member text is never persisted. */
  question: string;
  bucket: "A" | "B" | "C" | "unknown";
  retrievedChunkIds: string[];
  rerankTopScore: number;
  confidenceFloor: number;
  corpusSnapshotId: string;
  outcome: "answered" | "refused" | "upstream_failure";
  refusalTrigger: RefusalTrigger | "below_floor" | null;
}

export interface LoopState {
  consecutiveRefusals: number;
}
