import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/008_member_records.sql", "utf8");

describe("migration 008 [FR-P2-24, D-047]", () => {
  // A comment saying "synthetic" is not a guarantee. A check constraint is.
  it("makes it impossible to insert a member that is not synthetic", () => {
    expect(sql).toMatch(/synthetic\s+boolean not null default true check \(synthetic\)/);
  });

  it("ties every record to a member and removes them together", () => {
    for (const table of ["member_accumulators", "member_claims", "member_prior_authorizations", "member_appointments"]) {
      const block = new RegExp(`create table if not exists ${table}[\\s\\S]*?\\n\\);`).exec(sql)?.[0] ?? "";
      expect(block, table).toMatch(/references members \(id\) on delete cascade/);
    }
  });

  it("constrains status to the values the schema names", () => {
    expect(sql).toMatch(/status\s+text\s+not null check \(status in \('received','processing','paid','denied'\)\)/);
    expect(sql).toMatch(/status\s+text\s+not null check \(status in \('submitted','in_review','approved','denied'\)\)/);
  });

  // Thresholds differ by plan, so one system-wide constant would misplace a member.
  it("stores the drug thresholds per member", () => {
    expect(sql).toMatch(/drug_deductible\s+numeric/);
    expect(sql).toMatch(/out_of_pocket_limit\s+numeric/);
  });

  it("indexes every per-member lookup", () => {
    for (const index of ["member_claims_by_member", "member_pa_by_member", "member_appointments_by_member"]) {
      expect(sql, index).toContain(index);
    }
  });
});
