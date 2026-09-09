import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsMemberData } from "../../src/auth/login-required.ts";

interface LoginCase {
  id: string;
  question: string;
  needsMemberData: boolean;
  note: string;
}

const set = JSON.parse(readFileSync("eval/golden/login-set.json", "utf8")) as {
  cases: LoginCase[];
};

describe("login-detection set [NFR-P2-02]", () => {
  it("covers both directions in useful numbers", () => {
    expect(set.cases.length).toBeGreaterThanOrEqual(30);
    expect(set.cases.filter((c) => c.needsMemberData).length).toBeGreaterThanOrEqual(12);
    expect(set.cases.filter((c) => !c.needsMemberData).length).toBeGreaterThanOrEqual(12);
  });

  it("gives every case a unique id and a stated reason", () => {
    expect(new Set(set.cases.map((c) => c.id)).size).toBe(set.cases.length);
    for (const c of set.cases) expect(c.note.length, c.id).toBeGreaterThan(0);
  });

  // The severe direction: answering a member question with no identity.
  it("has no false negatives at all", () => {
    const missed = set.cases.filter((c) => c.needsMemberData && needsMemberData(c.question) === null);
    expect(missed.map((c) => c.question)).toEqual([]);
  });

  it("puts no public question behind a login wall", () => {
    const gated = set.cases.filter((c) => !c.needsMemberData && needsMemberData(c.question) !== null);
    expect(gated.map((c) => c.question)).toEqual([]);
  });
});
