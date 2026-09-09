import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chooseRoute } from "../../src/rag/router.ts";

interface RoutingCase {
  id: string;
  question: string;
  expectedPaths: ("structured" | "rag")[];
  note: string;
}

const set = JSON.parse(readFileSync("eval/golden/routing-set.json", "utf8")) as {
  cases: RoutingCase[];
};

describe("routing set [NFR-P2-03, D-063]", () => {
  it("holds at least the 30 cases the stage requires", () => {
    expect(set.cases.length).toBeGreaterThanOrEqual(30);
  });

  it("gives every case a unique id, an expectation and a reason", () => {
    const ids = set.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of set.cases) {
      expect(c.expectedPaths.length, c.id).toBeGreaterThan(0);
      expect(c.note.length, c.id).toBeGreaterThan(0);
    }
  });

  // A set that only contains one direction cannot detect a router that always
  // answers the same way.
  it("covers all three routing outcomes", () => {
    const shapes = new Set(set.cases.map((c) => [...c.expectedPaths].sort().join("+")));
    expect(shapes).toContain("structured");
    expect(shapes).toContain("rag");
    expect(shapes).toContain("rag+structured");
  });
});
