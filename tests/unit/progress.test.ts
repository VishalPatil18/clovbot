import { describe, expect, it } from "vitest";
import { STEP_MS, progressMessage, stageLineCount } from "../../web/src/progress.ts";

describe("progressMessage [D-077]", () => {
  it("opens each stage with its first line", () => {
    expect(progressMessage("retrieving", 0)).toBe("Understanding your question");
    expect(progressMessage("writing", 0)).toBe("Formulating your answer");
  });

  it("advances within a stage as the wait grows", () => {
    const first = progressMessage("retrieving", 0);
    const later = progressMessage("retrieving", STEP_MS + 1);
    expect(later).not.toBe(first);
  });

  // The fallback keeps a long wait moving; it must not narrate a stage that is
  // no longer running, which is what a pure timer would do.
  it("stops at the last line of its stage rather than running on", () => {
    const last = progressMessage("retrieving", STEP_MS * 99);
    expect(progressMessage("retrieving", STEP_MS * 999)).toBe(last);
    expect(last).not.toContain("Formulating");
  });

  it("never crosses from one stage into another", () => {
    for (const elapsed of [0, STEP_MS, STEP_MS * 5, STEP_MS * 50]) {
      expect(progressMessage("writing", elapsed)).not.toMatch(/Understanding|Looking|Finding|Reading/);
    }
  });

  it("gives every stage at least two lines, or the rotation does nothing", () => {
    for (const stage of ["retrieving", "writing"] as const) {
      expect(stageLineCount(stage)).toBeGreaterThanOrEqual(2);
    }
  });
});
