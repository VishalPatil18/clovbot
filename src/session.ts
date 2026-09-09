import type { LoopState } from "./types.ts";

export const INITIAL_LOOP_STATE: LoopState = { consecutiveRefusals: 0 };

/** Two refusals in a row is the point at which trying again stops helping. */
const LOOP_LIMIT = 2;

/** An answered turn resets the count; a refusal advances it. */
export function advanceLoopState(
  state: LoopState,
  outcome: "answered" | "refused",
): LoopState {
  return {
    consecutiveRefusals: outcome === "refused" ? state.consecutiveRefusals + 1 : 0,
  };
}

/** Two consecutive refusals arm the callback form for the next turn. */
export function shouldPresentCallbackForm(state: LoopState): boolean {
  return state.consecutiveRefusals >= LOOP_LIMIT;
}
