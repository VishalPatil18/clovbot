import type { Chunk, RankedChunk, TurnLog } from "./types.ts";

export interface IngestConfig {
  planYear: number;
  sourceDir: string;
}

export interface IngestResult {
  snapshotId: string;
  chunks: Chunk[];
  rejected: { path: string; reason: string }[];
}

/** One command, idempotent, versioned snapshot. FR-01, NFR-OPS-01. */
export function ingest(_config: IngestConfig): Promise<IngestResult> {
  throw new Error("not implemented");
}

export interface RetrieveOptions {
  topK: number;
  mode: "hybrid" | "dense" | "lexical";
  /** Plan scope. Retrieval never crosses contracts. FR-11. */
  contractId: string;
}

/** Hybrid by default; the single modes exist so the fusion tests have baselines. FR-02. */
export function retrieve(_query: string, _options: RetrieveOptions): Promise<RankedChunk[]> {
  throw new Error("not implemented");
}

export function writeTurnLog(_turn: TurnLog): Promise<void> {
  throw new Error("not implemented");
}

/** Reconstructs the retrieved context for a past turn. NFR-OPS-02. */
export function reproduceTurn(_turnId: string): Promise<Chunk[]> {
  throw new Error("not implemented");
}
