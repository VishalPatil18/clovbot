import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/005_contract_wildcard.sql", "utf8");

describe("migration 005 [D-056]", () => {
  // Half the predicate is the bug: matching only the wildcard drops every plan
  // document, matching only the session contract drops the formulary.
  it("scopes on the session contract or the wildcard, not one of them", () => {
    expect(sql).toMatch(/c\.contract_id\s*=\s*p_contract_id/);
    expect(sql).toMatch(/c\.contract_id\s*=\s*'\*'/);
  });

  it("keeps the plan predicate it already had", () => {
    expect(sql).toMatch(/c\.plan_id\s*=\s*p_plan_id/);
    expect(sql).toMatch(/c\.plan_id\s*=\s*'\*'/);
  });

  it("replaces the function rather than dropping it, so the signature is unchanged", () => {
    expect(sql).toContain("create or replace function search_hybrid");
    expect(sql).not.toContain("drop function");
  });
});
