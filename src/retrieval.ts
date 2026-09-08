import type { GateOutcome, RankedChunk } from "./types.ts";

/**
 * Reciprocal rank fusion. Ties resolve deterministically by id. FR-02.
 *
 * Mirrors the Postgres function used in production so the ranking can be
 * reasoned about and tested without a database. Both use score = sum of
 * 1 / (k + rank), rank being 1-based.
 */
export function fuseRrf(
  dense: readonly string[],
  lexical: readonly string[],
  k: number,
): RankedChunk[] {
  const scores = new Map<string, number>();

  for (const list of [dense, lexical]) {
    for (const [index, id] of list.entries()) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    }
  }

  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The single signal deciding answer versus refuse. FR-03, D-016. */
export function applyConfidenceGate(_topScore: number, _floor: number): GateOutcome {
  throw new Error("not implemented");
}
