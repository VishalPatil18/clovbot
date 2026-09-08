import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/007_corpus_snapshots.sql", "utf8");

describe("migration 007 [FR-P2-16, D-066]", () => {
  it("records both dates, because they mean different things", () => {
    expect(sql).toMatch(/documents_fetched_at\s+timestamptz not null/);
    expect(sql).toMatch(/ingested_at\s+timestamptz not null/);
  });

  it("keys on the snapshot so a re-ingest updates rather than accumulates", () => {
    expect(sql).toMatch(/snapshot_id\s+text primary key/);
  });

  it("carries the plan year the staleness check compares against", () => {
    expect(sql).toMatch(/plan_year\s+integer\s+not null/);
  });
});
