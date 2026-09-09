import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/010_needs_login_outcome.sql", "utf8");
const store = readFileSync("src/rag/store.ts", "utf8");

/** The union writeTurn can be handed, read from the type rather than restated. */
const writable = [
  ...(/outcome: ((?:"[a-z_]+"(?: \| )?)+)/.exec(store)?.[1] ?? "").matchAll(/"([a-z_]+)"/g),
].map((match) => match[1]);

describe("migration 010 [FR-P2-43]", () => {
  it("accepts every outcome the writer can produce", () => {
    expect(writable).toContain("needs_login");
    for (const outcome of writable) expect(sql).toContain(`'${outcome}'`);
  });

  it("replaces the old constraint rather than leaving two", () => {
    expect(sql).toMatch(/drop constraint if exists turns_outcome_check/);
  });
});
