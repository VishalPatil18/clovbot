import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/009_member_login.sql", "utf8");

describe("migration 009 [FR-P2-30, FR-P2-41]", () => {
  // The single most important property of this table.
  it("stores a hash and a salt, never a column that could hold the code", () => {
    expect(sql).toMatch(/code_hash\s+text\s+not null/);
    expect(sql).toMatch(/salt\s+text\s+not null/);
    expect(sql).not.toMatch(/\bcode\s+text/);
  });

  it("counts attempts and records when a code was spent", () => {
    expect(sql).toMatch(/attempts\s+integer\s+not null default 0/);
    expect(sql).toMatch(/consumed_at\s+timestamptz/);
  });

  it("tracks both clocks a session is judged by", () => {
    expect(sql).toMatch(/created_at\s+timestamptz not null/);
    expect(sql).toMatch(/last_seen_at\s+timestamptz not null/);
  });

  it("ties codes and sessions to a member and removes them together", () => {
    expect(sql.match(/references members \(id\) on delete cascade/g)).toHaveLength(2);
  });
});
