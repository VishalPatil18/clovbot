import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fieldsRead, formatFieldRead, type MemberRecord } from "../../src/members/store.ts";

const up = readFileSync("migrations/012_member_access_log.sql", "utf8");
const down = readFileSync("migrations/012_member_access_log_down.sql", "utf8");
const store = readFileSync("src/members/store.ts", "utf8");
const turn = readFileSync("src/rag/answer-turn.ts", "utf8");
const router = readFileSync("src/rag/router.ts", "utf8");
const server = readFileSync("src/server.ts", "utf8");

describe("minimum-necessary access [FR-P3-13, FR-P3-14, FR-P3-15]", () => {
  it("reads nothing when the question needs nothing", () => {
    expect(turn).toMatch(/memberId === undefined \|\| topic === null\s*\?\s*null/);
  });

  it("routes on whether the record is needed, not on who is signed in", () => {
    expect(router).toContain("needsRecord");
    expect(router).not.toContain("memberIdentified");
    expect(turn).toContain("const needsRecord = memberId !== undefined && topic !== null");
  });

  // FR-P3-16: one call, two consequences, so they cannot drift.
  it("derives the topic from the same rule that gates the question", () => {
    expect(turn).toMatch(/const identityNeeded = needsMemberData\(question\)/);
    expect(turn).toMatch(/const topic = identityNeeded\?\.topic \?\? null/);
  });

  it("selects named columns rather than whole rows", () => {
    expect(store).not.toMatch(/select \* from member_/);
    for (const table of ["member_claims", "member_accumulators", "member_appointments"]) {
      expect(store, table).toMatch(new RegExp(`\\\${\\w+_COLUMNS} from ${table}`));
    }
  });

  // D-091: nothing in an answer addresses the member by name, so nothing reads it.
  it("never reads the member's name to answer a question", () => {
    expect(store).not.toMatch(/select[^;`]*display_name/);
  });
});

describe("the access log names fields, never values [FR-P3-17, FR-P3-18, FR-P3-19]", () => {
  const record: MemberRecord = {
    id: 1,
    contractId: "H5141",
    planId: "004",
    planYear: 2026,
    facts: [
      {
        item: "Claim CLM-0031",
        field: "What you owe",
        text: "Billed $210, the plan paid $200, and $47.50 is owed.",
        sources: [
          { table: "member_claims", column: "member_owes", rowId: "CLM-0031" },
          { table: "member_claims", column: "billed", rowId: "CLM-0031" },
        ],
      },
    ],
  };

  it("names the column and the row it came from", () => {
    expect(formatFieldRead({ table: "member_claims", column: "member_owes", rowId: "CLM-0031" }))
      .toBe("member_claims.member_owes@CLM-0031");
  });

  it("holds no value from the row it describes", () => {
    const logged = fieldsRead(record).join(" ");
    expect(logged).toContain("member_claims.member_owes@CLM-0031");
    expect(logged).not.toContain("47.50");
    expect(logged).not.toContain("210");
  });

  it("deduplicates and orders, so two reads of one column log once", () => {
    const twice: MemberRecord = {
      ...record,
      facts: [...record.facts, ...record.facts],
    };
    expect(fieldsRead(twice)).toEqual([
      "member_claims.billed@CLM-0031",
      "member_claims.member_owes@CLM-0031",
    ]);
  });

  it("logs nothing when nothing was read", () => {
    expect(fieldsRead(null)).toEqual([]);
    expect(fieldsRead({ ...record, facts: [] })).toEqual([]);
  });

  // FR-P3-22: the audit is built from the same structure the answer is, so a
  // cited field cannot be missing from the log.
  it("derives the log from the facts the answer was built from", () => {
    expect(store).toContain("record.facts.flatMap((fact) => fact.sources");
  });
});

describe("every authenticated turn is audited [FR-P3-17, FR-P3-20, FR-P3-23]", () => {
  it("writes one row whatever the outcome, outside the branching", () => {
    expect(turn).toMatch(/const result = await runTurn\(/);
    expect(turn).toMatch(/if \(options\.memberId !== undefined\) \{\s*await writeAccessLog\(/);
    expect(turn).toMatch(/outcome: result\.outcome/);
  });

  it("records the redacted question, not the raw one", () => {
    expect(turn).toMatch(/const question = redactIdentifiers\(rawQuestion\)[\s\S]*writeAccessLog/);
  });

  it("names the session the member id came from", () => {
    expect(turn).toContain("sessionId: options.sessionId ?? null");
    expect(server).toContain("sessionId: member.sessionId");
  });

  // Failing to record an access must not be survivable: no answer has reached
  // the member at that point, so nothing is disclosed unrecorded.
  it("does not swallow a failed audit write", () => {
    const audit = turn.slice(turn.indexOf("if (options.memberId !== undefined)"));
    expect(audit.slice(0, 400)).not.toMatch(/catch|\.catch\(/);
  });
});

describe("the log is append-only [FR-P3-21]", () => {
  it("grants insert and select and nothing else", () => {
    expect(up).toContain("grant select, insert on member_access_log to clovbot_app");
    expect(up).not.toMatch(/grant[^;]*\b(update|delete)\b[^;]*member_access_log/);
  });

  it("has no application path that changes a row", () => {
    expect(store).not.toMatch(/update member_access_log|delete from member_access_log/);
  });

  it("is itself behind a policy, so one member cannot read another's history", () => {
    expect(up).toContain("alter table member_access_log force row level security");
    expect(up).toMatch(/create policy \w+ on member_access_log/);
    expect(up).toContain("current_member_id()");
  });

  it("reverses, and leaves the log itself in place", () => {
    expect(down).toContain("drop policy if exists member_access_log_own_row");
    expect(down).toContain("revoke all on member_access_log from clovbot_app");
    expect(down).not.toMatch(/^drop table member_access_log/m);
  });
});

describe("an expired session says so [FR-P3-24]", () => {
  it("tells an expired session apart from never having signed in", () => {
    const auth = readFileSync("src/auth/store.ts", "utf8");
    expect(auth).toContain("return { session: null, ended: state }");
    expect(auth).toContain("return { session: null, ended: null }");
  });

  it("names the limit that was reached, in plain words", () => {
    expect(server).toMatch(/SESSION_ENDED[\s\S]*30 minutes without activity/);
    expect(server).toMatch(/SESSION_ENDED[\s\S]*8 hours/);
    expect(server).toContain("Sign in again to see your own details");
  });
});

describe("sign-in still works under the policies [FR-P3-07]", () => {
  const auth = readFileSync("src/auth/store.ts", "utf8");
  const login = readFileSync("migrations/013_login_path_under_rls.sql", "utf8");

  // The join these paths made was silently returning nothing once 011 applied.
  it("looks a member up by email through a definer function", () => {
    expect(auth).toContain("from member_for_login($1)");
    expect(auth).not.toMatch(/from members where lower\(email\)/);
    expect(login).toContain("security definer");
    expect(login).toContain("set search_path = public, pg_temp");
  });

  it("returns only an id and the address that matched", () => {
    expect(login).toMatch(/returns table \(id integer, email text\)/);
    expect(login).toContain("revoke all on function member_for_login(text) from public");
  });

  it("reads the session row first, then the member under that identity", () => {
    expect(auth).not.toMatch(/join members m on m\.id = s\.member_id/);
    expect(auth).toMatch(/withMemberIdentity\(client, memberId[\s\S]*display_name/);
  });
});
