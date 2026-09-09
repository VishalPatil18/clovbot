import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const harness = readFileSync("eval/harness/run.ts", "utf8");

describe("regression gate [NFR-P2-04, FR-P2-52]", () => {
  // A floor of 0.90 lets a slide from 1.000 to 0.91 pass, which is what
  // NFR-P2-04 exists to catch.
  it("gates faithfulness well above the P1 floor", () => {
    expect(harness).toMatch(/faithfulness: 0\.96/);
  });

  it("gates every P1 metric, not just faithfulness", () => {
    expect(harness).toMatch(/structural: 1/);
    expect(harness).toMatch(/refusalRate: 0\.2/);
    expect(harness).toMatch(/buckets: \{ A: 36 \/ 40, B: 8 \/ 8, C: 10 \/ 10 \}/);
  });

  it("fails the run when a floor is breached", () => {
    expect(harness).toMatch(/routing\.failed \|\| login\.failed \|\| regressed\) process\.exit\(1\)/);
  });

  // The tolerance is one case, and the measurement that justifies it is written
  // beside it rather than being a round number.
  it("records why the floor sits one case below the baseline", () => {
    expect(harness).toMatch(/two of six runs/);
    expect(harness).toMatch(/One flip passes here; two do not/);
  });
});
