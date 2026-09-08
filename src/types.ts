export type DocumentKind =
  | "evidence_of_coverage"
  | "summary_of_benefits"
  | "formulary"
  | "provider_directory"
  | "pharmacy_directory"
  | "supplemental_benefits";

/** A citation without a plan year is not a valid citation. FR-06. */
export interface Provenance {
  document: DocumentKind;
  planYear: number;
  contractId: string;
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
export interface AnswerPayload {
  claims: Claim[];
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
