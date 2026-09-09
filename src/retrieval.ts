import type { GateOutcome, RankedChunk } from "./types.ts";

/**
 * Reciprocal rank fusion, ties resolved by id. Mirrors the Postgres function so
 * ranking can be tested without a database: score = sum of 1 / (k + rank).
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
 * Coarse gate only: the reranker orders well but its absolute value collapses on
 * conversational phrasing. The contract is enforced in src/answer.ts, not here.
 */
export function applyConfidenceGate(topScore: number, floor: number): GateOutcome {
  if (!Number.isFinite(topScore) || topScore < floor) {
    return { kind: "refuse", reason: "below_floor" };
  }
  return { kind: "answer" };
}
