import { describe, expect, it } from "vitest";
import { partDStage } from "../../src/members/stage.ts";

// H5141-004, read from its Evidence of Coverage.
const plan004 = { drugDeductible: 150, outOfPocketLimit: 2_100 };
// H5141-007 sets a different deductible, which is why this is per plan.
const plan007 = { drugDeductible: 220, outOfPocketLimit: 2_100 };

describe("partDStage [FR-P2-25, D-081]", () => {
  it("is the deductible stage before the deductible is met", () => {
    expect(partDStage(0, plan004)).toBe("deductible");
    expect(partDStage(149.99, plan004)).toBe("deductible");
  });

  it("moves to initial coverage once the deductible is met", () => {
    expect(partDStage(150, plan004)).toBe("initial");
    expect(partDStage(1_000, plan004)).toBe("initial");
  });

  it("moves to catastrophic at the out-of-pocket limit", () => {
    expect(partDStage(2_100, plan004)).toBe("catastrophic");
    expect(partDStage(5_000, plan004)).toBe("catastrophic");
  });

  // The deductible differs by plan, so one constant would put a 007 member in
  // the wrong stage between $150 and $220.
  it("uses the member's own plan threshold", () => {
    expect(partDStage(200, plan004)).toBe("initial");
    expect(partDStage(200, plan007)).toBe("deductible");
  });

  it("refuses a negative spend rather than guessing a stage", () => {
    expect(() => partDStage(-1, plan004)).toThrow(/spend/i);
  });

  it("refuses thresholds that are the wrong way round", () => {
    expect(() => partDStage(100, { drugDeductible: 3_000, outOfPocketLimit: 2_100 })).toThrow(
      /threshold/i,
    );
  });
});
