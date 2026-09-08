import type { GateOutcome, RankedChunk } from "./types.ts";

/** Reciprocal rank fusion. Ties resolve deterministically by id. FR-02. */
export function fuseRrf(
  _dense: readonly string[],
  _lexical: readonly string[],
  _k: number,
): RankedChunk[] {
  throw new Error("not implemented");
}

/** The single signal deciding answer versus refuse. FR-03, D-016. */
export function applyConfidenceGate(_topScore: number, _floor: number): GateOutcome {
  throw new Error("not implemented");
}
