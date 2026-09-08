import { describe, expect, it } from "vitest";
import { needsPlanContext } from "../../src/rag/plan-scope.ts";

describe("needsPlanContext [FR-10, D-022]", () => {
  // Anything whose answer differs between plan 004 and plan 007.
  it("requires plan context for a cost question", () => {
    expect(needsPlanContext("what is my specialist copay")).toBe(true);
  });

  it("requires plan context for a deductible question", () => {
    expect(needsPlanContext("what is my deductible")).toBe(true);
  });

  it("requires plan context for an out-of-pocket maximum question", () => {
    expect(needsPlanContext("what is my maximum out of pocket")).toBe(true);
  });

  it("requires plan context for a drug tier question", () => {
    expect(needsPlanContext("what tier is atorvastatin on")).toBe(true);
  });

  it("requires plan context when a member asks what something costs, in their own words", () => {
    expect(
      needsPlanContext("there's an urgent care down the street, what would that run me"),
    ).toBe(true);
  });

  it("requires plan context for a coverage question", () => {
    expect(needsPlanContext("are hearing aids covered")).toBe(true);
  });

  // Process questions read the same on every plan, so asking would be friction.
  it("does not require plan context for the appeals process", () => {
    expect(needsPlanContext("how do I file an appeal")).toBe(false);
  });

  it("does not require plan context for what prior authorization means", () => {
    expect(needsPlanContext("what does prior authorization mean")).toBe(false);
  });

  it("does not require plan context for a definition", () => {
    expect(needsPlanContext("what is a formulary")).toBe(false);
  });

  it("does not require plan context for a greeting", () => {
    expect(needsPlanContext("hello")).toBe(false);
  });

  it("does not require plan context for who Clover is", () => {
    expect(needsPlanContext("who is Clover Health")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(needsPlanContext("WHAT IS MY COPAY")).toBe(true);
  });

  it("treats empty input as not needing plan context", () => {
    expect(needsPlanContext("")).toBe(false);
  });
});
