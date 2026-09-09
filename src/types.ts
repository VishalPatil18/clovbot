export type DocumentKind =
  | "evidence_of_coverage"
  | "summary_of_benefits"
  | "annual_notice_of_change"
  | "formulary"
  | "provider_directory"
  | "pharmacy_directory"
  | "corporate";

/**
 * Contract and plan travel together: ids repeat across contracts, so a bare
 * "002" cannot tell H5141-002 from H8010-002.
 */
export interface PlanRef {
  contractId: string;
  planId: string;
  planYear: number;
}

/**
 * A member's record is citable but is not a corpus document, so it widens this
 * rather than DocumentKind.
 */
export type CitableKind = DocumentKind | "member_record";

/** A citation without a plan year is not a valid citation. */
export interface Provenance {
  document: DocumentKind;
  planYear: number;
  contractId: string;
  /** Contract alone does not identify a plan, and two plans differ on price. */
  planId: string;
  section: string;
}

export interface Chunk {
  id: string;
  text: string;
  /** Frozen into fixtures at ingest, so tests stay deterministic. */
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

/** Claims carry citations, so an uncited claim cannot be represented. */
/** Cited like a claim: the largest thing on the screen cannot be uncited. */
export interface Headline {
  /** What the amount measures. "$10" alone does not say copay or deductible. */
  label: string;
  amount: string;
  citationIds: string[];
}

export interface AnswerPayload {
  claims: Claim[];
  /** Null when the answer is not a single amount: the prose path. */
  headline: Headline | null;
  unanswered: string[];
  refusal: Refusal | null;
}

export type ValidationResult =
  | { ok: true; value: AnswerPayload }
  | { ok: false; errors: string[] };

export interface TurnLog {
  id: string;
  /** Redacted. Raw member text is never persisted. */
  question: string;
  bucket: "A" | "B" | "C" | "unknown";
  retrievedChunkIds: string[];
  rerankTopScore: number;
  confidenceFloor: number;
  corpusSnapshotId: string;
  outcome: "answered" | "refused" | "upstream_failure" | "needs_login";
  refusalTrigger: RefusalTrigger | "below_floor" | null;
}

export interface LoopState {
  consecutiveRefusals: number;
}
