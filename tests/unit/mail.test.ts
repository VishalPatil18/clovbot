import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mail = readFileSync("src/auth/mail.ts", "utf8");

describe("login mail [FR-P2-41]", () => {
  // The one line that must never exist: a code in a log on the delivery path.
  it("logs the code only when there is no way to send it, and says so", () => {
    const logs = mail.match(/console\.(log|warn|error)\([^)]*\)/g) ?? [];
    const withCode = logs.filter((line) => line.includes("${code}"));
    expect(withCode).toHaveLength(1);
    expect(mail).toMatch(/development code/);
  });

  it("never returns the code to its caller", () => {
    expect(mail).not.toMatch(/detail:.*\$\{code\}/);
  });

  it("records only the status when the provider rejects a send", () => {
    expect(mail).toMatch(/mail provider returned \$\{String\(response\.status\)\}/);
    expect(mail).not.toMatch(/await response\.text\(\)|await response\.json\(\)/);
  });

  it("redacts identifiers from anything it does log", () => {
    expect(mail).toContain("redactIdentifiers");
  });

  it("states the case study is unaffiliated, as FR-30 requires everywhere else", () => {
    expect(mail).toMatch(/unaffiliated case study/i);
  });

  it("tells the member the code is single use and short lived", () => {
    expect(mail).toMatch(/works once/);
    expect(mail).toMatch(/expires in 10 minutes/);
  });
});
