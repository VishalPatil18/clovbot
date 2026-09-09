import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/006_drugs_and_routing.sql", "utf8");

describe("migration 006 [D-060, D-063]", () => {
  it("constrains tier to the values the formulary actually uses", () => {
    expect(sql).toMatch(/tier\s+integer\s+not null\s+check \(tier between 1 and 5\)/);
  });

  it("keys rows by snapshot so a re-ingest cannot mix two corpora", () => {
    expect(sql).toMatch(/primary key \(snapshot_id, normalized_name, name\)/);
    expect(sql).toMatch(/create index if not exists drugs_lookup/);
  });

  it("records the router's selection and its reason on the turn", () => {
    expect(sql).toMatch(/add column if not exists route\s+text/);
    expect(sql).toMatch(/add column if not exists route_reason text/);
  });

  it("adds columns rather than replacing the turns table", () => {
    expect(sql).not.toMatch(/drop table|drop column/i);
  });
});
