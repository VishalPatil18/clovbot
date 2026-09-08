import { describe, expect, it } from "vitest";
import { INITIAL_LOOP_STATE, advanceLoopState, shouldPresentCallbackForm } from "../../src/session.ts";

describe("loop breaker [FR-23]", () => {
  it("does not present the form at the start of a session", () => {
    expect(shouldPresentCallbackForm(INITIAL_LOOP_STATE)).toBe(false);
  });

  it("does not present the form after one refusal", () => {
    const state = advanceLoopState(INITIAL_LOOP_STATE, "refused");
    expect(shouldPresentCallbackForm(state)).toBe(false);
  });

  it("presents the form after two consecutive refusals", () => {
    let state = advanceLoopState(INITIAL_LOOP_STATE, "refused");
    state = advanceLoopState(state, "refused");
    expect(shouldPresentCallbackForm(state)).toBe(true);
  });

  it("resets the count when a turn is answered", () => {
    let state = advanceLoopState(INITIAL_LOOP_STATE, "refused");
    state = advanceLoopState(state, "answered");
    state = advanceLoopState(state, "refused");
    expect(shouldPresentCallbackForm(state)).toBe(false);
  });

  it("stays armed on a third consecutive refusal", () => {
    let state = INITIAL_LOOP_STATE;
    for (let i = 0; i < 3; i += 1) state = advanceLoopState(state, "refused");
    expect(shouldPresentCallbackForm(state)).toBe(true);
  });

  it("does not mutate the state it is given", () => {
    const state = { consecutiveRefusals: 1 };
    advanceLoopState(state, "refused");
    expect(state.consecutiveRefusals).toBe(1);
  });
});
