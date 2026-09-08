import { describe, expect, it } from "vitest";
import { chooseRoute, type DrugIndex } from "../../src/rag/router.ts";

const index: DrugIndex = new Set([
  "atorvastatin calcium",
  "amlodipine besylate",
  "amlodipine besylate-atorvastatin calcium",
  "eliquis",
  "choline fenofibrate",
]);

const route = (question: string) => chooseRoute(question, index);

describe("chooseRoute [FR-P2-09, D-061]", () => {
  it("adds the structured path when the question names an indexed drug", () => {
    expect(route("what tier is atorvastatin on").paths).toContain("structured");
  });

  it("matches a multi-word drug name", () => {
    expect(route("is choline fenofibrate covered").paths).toContain("structured");
  });

  // A bare "amlodipine" must not silently resolve to the combination product,
  // whose tier is a different number.
  it("prefers the longest matching name", () => {
    expect(route("what tier is amlodipine besylate-atorvastatin calcium on").drugs).toEqual([
      "amlodipine besylate-atorvastatin calcium",
    ]);
  });

  it("does not route a drug the table does not hold", () => {
    expect(route("what tier is ozempic on").paths).toEqual(["rag"]);
  });

  // NFR-P2-03's zero-tolerance direction: a tier question about an indexed drug
  // can never fall through to prose search alone.
  it("never sends an indexed drug's tier question to prose search alone", () => {
    for (const phrasing of [
      "what tier is atorvastatin on",
      "how much is my atorvastatin",
      "is ELIQUIS covered",
      "what tier is Atorvastatin Calcium",
    ]) {
      expect(route(phrasing).paths, phrasing).toContain("structured");
    }
  });

  it("keeps prose retrieval when the question also asks about a rule", () => {
    const decision = route("is eliquis covered and how do I appeal a denial");
    expect(decision.paths).toContain("structured");
    expect(decision.paths).toContain("rag");
  });

  it("drops prose retrieval for a pure lookup", () => {
    expect(route("what tier is atorvastatin on").paths).toEqual(["structured"]);
  });

  it("uses prose search when no drug is named", () => {
    expect(route("how do I file an appeal").paths).toEqual(["rag"]);
    expect(route("what is my specialist copay").paths).toEqual(["rag"]);
  });

  it("states a reason on every decision", () => {
    expect(route("what tier is atorvastatin on").reason.length).toBeGreaterThan(0);
    expect(route("how do I file an appeal").reason.length).toBeGreaterThan(0);
  });

  it("does not match a drug name inside a longer word", () => {
    expect(route("what is eliquisation").paths).toEqual(["rag"]);
  });
});
