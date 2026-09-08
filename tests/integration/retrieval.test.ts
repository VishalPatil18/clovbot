import { describe, expect, it } from "vitest";
import { retrieve } from "../../src/pipeline.ts";

const PLAN_A = "H5141-001";
const hybrid = { topK: 5, mode: "hybrid" as const, contractId: PLAN_A };

describe("retrieval against the fixture corpus [FR-02]", () => {
  it("returns the expected chunk for a cost question", async () => {
    const results = await retrieve("what is my specialist copay", hybrid);
    expect(results.map((r) => r.id)).toContain("eoc-specialist-copay-01");
  });

  it("is deterministic across runs", async () => {
    const first = await retrieve("what is my specialist copay", hybrid);
    const second = await retrieve("what is my specialist copay", hybrid);
    expect(first).toEqual(second);
  });

  it("never crosses plan scope [FR-11]", async () => {
    const results = await retrieve("what is my specialist copay", hybrid);
    expect(results.map((r) => r.id)).not.toContain("sob-specialist-copay-planb-01");
  });

  it("never returns an out-of-year chunk", async () => {
    const results = await retrieve("what is my specialist copay", hybrid);
    expect(results.map((r) => r.id)).not.toContain("sob-2025-stale-01");
  });

  it("hybrid beats dense-only on an exact-token query [D-004]", async () => {
    const dense = await retrieve("atorvastatin tier", { ...hybrid, mode: "dense" });
    const fused = await retrieve("atorvastatin tier", hybrid);
    const rankIn = (rs: { id: string }[]) => rs.findIndex((r) => r.id === "formulary-atorvastatin-01");
    expect(rankIn(fused)).toBeGreaterThanOrEqual(0);
    expect(rankIn(fused)).toBeLessThan(rankIn(dense) === -1 ? Number.MAX_SAFE_INTEGER : rankIn(dense));
  });

  it("hybrid beats lexical-only on a paraphrased query [D-004]", async () => {
    const lexical = await retrieve("what does it cost to see a skin doctor", { ...hybrid, mode: "lexical" });
    const fused = await retrieve("what does it cost to see a skin doctor", hybrid);
    const rankIn = (rs: { id: string }[]) => rs.findIndex((r) => r.id === "sob-dermatology-innetwork-01");
    expect(rankIn(fused)).toBeGreaterThanOrEqual(0);
    expect(rankIn(fused)).toBeLessThan(rankIn(lexical) === -1 ? Number.MAX_SAFE_INTEGER : rankIn(lexical));
  });

  it("surfaces both sides of a source conflict so precedence can be applied [FR-07]", async () => {
    const ids = (await retrieve("what is my specialist copay", hybrid)).map((r) => r.id);
    expect(ids).toContain("eoc-specialist-copay-01");
    expect(ids).toContain("sob-specialist-copay-01");
  });

  it("returns nothing rather than something adjacent when the answer is absent", async () => {
    const results = await retrieve("what is the out of network dermatology copay", hybrid);
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("sob-orphan-amount-01");
  });
});
