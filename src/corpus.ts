import type { Chunk, Provenance } from "./types.ts";

export interface ChunkOptions {
  maxChars: number;
  snapshotId: string;
  provenance: Provenance;
}

/** Header-aware splitting. Pure: same markdown in, same chunks out. */
export function chunkMarkdown(_markdown: string, _options: ChunkOptions): Chunk[] {
  throw new Error("not implemented");
}

/** Raises on missing plan year rather than defaulting one. FR-06. */
export function buildProvenance(_raw: Record<string, unknown>): Provenance {
  throw new Error("not implemented");
}

/** Ingest-time gate. Out-of-year documents never enter the index. FR-01. */
export function isAllowedPlanYear(_year: unknown, _configured: number): boolean {
  throw new Error("not implemented");
}
