import type { LoopState } from "./types.ts";

export const INITIAL_LOOP_STATE: LoopState = { consecutiveRefusals: 0 };

/** An answered turn resets the count; a refusal advances it. FR-23. */
export function advanceLoopState(
  _state: LoopState,
  _outcome: "answered" | "refused",
): LoopState {
  throw new Error("not implemented");
}

/** Two consecutive refusals arm the callback form for the next turn. FR-23. */
export function shouldPresentCallbackForm(_state: LoopState): boolean {
  throw new Error("not implemented");
}
