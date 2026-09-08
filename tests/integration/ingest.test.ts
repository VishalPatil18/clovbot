import { describe, expect, it } from "vitest";
import { ingest } from "../../src/pipeline.ts";

const CONFIG = { planYear: 2026, sourceDir: "tests/fixtures/corpus" };

describe("ingest [FR-01, NFR-OPS-01]", () => {
  it("produces a snapshot id", async () => {
    const result = await ingest(CONFIG);
    expect(result.snapshotId).toBeTruthy();
  });

  it("is idempotent: a second run keeps the same snapshot id", async () => {
    const first = await ingest(CONFIG);
    const second = await ingest(CONFIG);
    expect(second.snapshotId).toBe(first.snapshotId);
  });

  it("is idempotent: a second run creates no duplicate chunks", async () => {
    const first = await ingest(CONFIG);
    const second = await ingest(CONFIG);
    expect(second.chunks).toHaveLength(first.chunks.length);
  });

  it("rejects an out-of-year document rather than filtering it later", async () => {
    const result = await ingest(CONFIG);
    expect(result.rejected.some((r) => r.path.includes("2025"))).toBe(true);
    expect(result.chunks.some((c) => c.provenance.planYear !== 2026)).toBe(false);
  });

  it("rejects a chunk whose provenance has no plan year", async () => {
    const result = await ingest(CONFIG);
    expect(result.chunks.some((c) => c.id === "sob-missing-planyear-01")).toBe(false);
  });

  it("gives every surviving chunk complete provenance", async () => {
    const result = await ingest(CONFIG);
    for (const chunk of result.chunks) {
      expect(chunk.provenance.planYear).toBe(2026);
      expect(chunk.provenance.contractId).toBeTruthy();
      expect(chunk.provenance.section).toBeTruthy();
    }
  });

  it("gives a chunk with no header context a contextual prefix anyway", async () => {
    const result = await ingest(CONFIG);
    const orphan = result.chunks.find((c) => c.id === "sob-orphan-amount-01");
    expect(orphan?.contextPrefix).not.toBe("");
  });
});
