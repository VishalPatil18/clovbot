import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const up = readFileSync("migrations/011_row_level_security.sql", "utf8");
const down = readFileSync("migrations/011_row_level_security_down.sql", "utf8");
const store = readFileSync("src/rag/store.ts", "utf8");
const members = readFileSync("src/members/store.ts", "utf8");
const check = readFileSync("scripts/rls-check.ts", "utf8");

const MEMBER_SCOPED = [
  "members",
  "member_accumulators",
  "member_claims",
  "member_prior_authorizations",
  "member_appointments",
];

describe("migration 011 [FR-P3-03, FR-P3-07]", () => {
  it("enables and forces row-level security on every member-scoped table", () => {
    for (const table of MEMBER_SCOPED) {
      expect(up, table).toContain(`alter table ${table} enable row level security`);
      // Without FORCE the owning role reads every row and the policy is decoration.
      expect(up, table).toContain(`alter table ${table} force row level security`);
    }
  });

  it("gives every one of them a policy keyed on the connection identity", () => {
    for (const table of MEMBER_SCOPED) {
      expect(up, table).toMatch(new RegExp(`create policy \\w+ on ${table}\\b`));
    }
    expect(up.match(/current_member_id\(\)/g)?.length).toBeGreaterThanOrEqual(MEMBER_SCOPED.length);
  });

  // FR-P3-06: current_setting with the missing_ok flag yields NULL, and
  // `member_id = NULL` is never true, so no identity means no rows.
  it("reads the identity in a form that yields nothing when unset", () => {
    expect(up).toContain("current_setting('clovbot.member_id', true)");
    expect(up).toContain("nullif(");
  });

  it("grants the application no delete on anything holding member data", () => {
    const memberGrant = /grant select on members, member_accumulators, member_claims,\s*member_prior_authorizations, member_appointments to clovbot_app;/;
    expect(up).toMatch(memberGrant);
    // rate_events is the one delete, and it holds no member data.
    const deletes = [...up.matchAll(/grant [^;]*delete[^;]*;/g)].map((m) => m[0]);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain("rate_events");
  });

  it("records why login_codes and member_sessions carry no policy", () => {
    for (const table of ["login_codes", "member_sessions"]) {
      expect(up, table).toMatch(new RegExp(`comment on table ${table} is`));
      expect(up, table).not.toMatch(new RegExp(`create policy \\w+ on ${table}\\b`));
    }
  });
});

describe("migration 011 is reversible [FR-P3-09]", () => {
  it("drops every policy it creates", () => {
    const created = [...up.matchAll(/create policy (\w+) on (\w+)/g)];
    expect(created.length).toBe(MEMBER_SCOPED.length);
    for (const [, policy, table] of created) {
      expect(down, policy).toContain(`drop policy if exists ${policy} on ${table}`);
    }
  });

  it("disables row-level security everywhere it enabled it", () => {
    for (const table of MEMBER_SCOPED) {
      expect(down, table).toContain(`alter table ${table} disable row level security`);
      expect(down, table).toContain(`alter table ${table} no force row level security`);
    }
  });

  it("revokes what it granted and drops the function it created", () => {
    expect(down).toContain("drop function if exists current_member_id()");
    expect(down).toMatch(/revoke all on [\s\S]*clovbot_app;/);
    expect(down).toContain("revoke usage on schema public from clovbot_app");
  });
});

describe("the application connects as the restricted role [FR-P3-01, FR-P3-02]", () => {
  it("reads the product's connection from its own variable", () => {
    expect(store).toContain('client("DATABASE_APP_URL")');
    expect(store).toContain('client("DATABASE_URL")');
  });

  // A fallback to the admin URL would silently restore the thing this removes.
  it("has no fallback from the application URL to the admin URL", () => {
    expect(store).not.toMatch(/DATABASE_APP_URL"?\]?\s*\?\?/);
    expect(store).toMatch(/missing \$\{variable\}/);
  });

  it("keeps ingest and seeding on the admin connection", () => {
    expect(readFileSync("src/rag/cli.ts", "utf8")).toContain("connectAdmin()");
    expect(readFileSync("src/members/cli.ts", "utf8")).toContain("connectAdmin()");
  });
});

describe("the identity is transaction-local [FR-P3-05]", () => {
  // A session SET would ride the pooled connection into the next request.
  it("sets it with the local flag inside a transaction", () => {
    expect(members).toContain("set_config('clovbot.member_id', $1, true)");
    expect(members).toMatch(/begin[\s\S]*set_config[\s\S]*commit/);
    expect(members).not.toMatch(/query\(\s*"set clovbot/i);
  });

  it("rolls back rather than leaving a transaction open on failure", () => {
    expect(members).toMatch(/catch[\s\S]*rollback/);
  });

  it("keeps the application-layer scoping as well", () => {
    expect(members).toContain("where member_id = $1");
  });
});

describe("the proof bypasses the application [FR-P3-11]", () => {
  it("issues raw selects rather than calling the record loader", () => {
    expect(check).not.toMatch(/loadMemberRecord\(/);
    expect(check).toMatch(/select 1 from \$\{table\}/);
  });

  // A check that reads an empty table passes for the wrong reason.
  it("shows the empty result is the policy rather than an empty table", () => {
    expect(check).toMatch(/identify\(app, OTHER\)/);
    expect(check).toContain("proves nothing");
  });

  // Turning security off on a live table is a hazard the first time a rollback
  // does not run. The check must not contain that path at all.
  it("never disables row-level security to make its point", () => {
    expect(check).not.toMatch(/disable row level security/);
  });

  it("enumerates member-scoped tables from the catalog, not from its own list", () => {
    expect(check).toContain("pg_attribute");
    expect(check).toContain("attname = 'member_id'");
  });
});
