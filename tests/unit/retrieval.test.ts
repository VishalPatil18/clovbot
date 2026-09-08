import { describe, expect, it } from "vitest";
import { applyConfidenceGate, fuseRrf } from "../../src/retrieval.ts";

describe("fuseRrf [FR-02]", () => {
  it("ranks a chunk appearing in both lists above one appearing in only one", () => {
    const fused = fuseRrf(["a", "b", "c"], ["c", "d", "e"], 60);
    expect(fused[0]?.id).toBe("c");
  });

  it("preserves every input id exactly once", () => {
    const fused = fuseRrf(["a", "b"], ["b", "c"], 60);
    expect(fused.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("resolves ties deterministically by id", () => {
    const first = fuseRrf(["x", "y"], ["y", "x"], 60);
    const second = fuseRrf(["x", "y"], ["y", "x"], 60);
    expect(first).toEqual(second);
  });

  it("gives a lower k a sharper rank preference", () => {
    const sharp = fuseRrf(["a", "b"], ["a", "b"], 1);
    const flat = fuseRrf(["a", "b"], ["a", "b"], 1000);
    const sharpGap = (sharp[0]?.score ?? 0) - (sharp[1]?.score ?? 0);
    const flatGap = (flat[0]?.score ?? 0) - (flat[1]?.score ?? 0);
    expect(sharpGap).toBeGreaterThan(flatGap);
  });

  it("handles one empty list", () => {
    expect(fuseRrf(["a"], [], 60).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("applyConfidenceGate [FR-03, D-016]", () => {
  it("answers above the floor", () => {
    expect(applyConfidenceGate(0.8, 0.5)).toEqual({ kind: "answer" });
  });

  it("answers exactly at the floor", () => {
    expect(applyConfidenceGate(0.5, 0.5)).toEqual({ kind: "answer" });
  });

  it("refuses below the floor", () => {
    expect(applyConfidenceGate(0.49, 0.5)).toEqual({ kind: "refuse", reason: "below_floor" });
  });

  it("refuses when there is no score at all", () => {
    expect(applyConfidenceGate(Number.NEGATIVE_INFINITY, 0.5)).toEqual({
      kind: "refuse",
      reason: "below_floor",
    });
  });
});
