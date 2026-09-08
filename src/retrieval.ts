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

/**
 * Coarse relevance gate. FR-03, amended by D-038: the reranker score orders well
 * but its absolute value collapses on conversational phrasing, so this catches
 * only questions with nothing relevant at all. The answer contract is enforced by
 * the structured payload in src/answer.ts, not by this threshold.
 */
export function applyConfidenceGate(topScore: number, floor: number): GateOutcome {
  if (!Number.isFinite(topScore) || topScore < floor) {
    return { kind: "refuse", reason: "below_floor" };
  }
  return { kind: "answer" };
}
