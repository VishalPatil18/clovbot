import { randomUUID } from "node:crypto";
import type pg from "pg";
import { generateCode, hashCode, newSalt, verifyCode, type VerifyResult } from "./otp.ts";
import { sessionState, type SessionState } from "./session.ts";
import { withMemberIdentity } from "../members/store.ts";

export interface MemberSession {
  sessionId: string;
  memberId: number;
  displayName: string;
}

/** Looks a member up by the address they typed. Null when nobody matches. */
export async function memberByEmail(
  client: pg.Client,
  email: string,
): Promise<{ id: number; email: string } | null> {
  // Through a definer function: `members` is behind a policy and a sign-in has
  // no identity yet to satisfy it. See migration 013.
  const { rows } = await client.query("select id, email from member_for_login($1)", [email]);
  const row = rows[0] as Record<string, unknown> | undefined;
  return row === undefined ? null : { id: Number(row["id"]), email: String(row["email"]) };
}

/** Issues a code and returns it once, to be sent and then forgotten. */
export async function issueCode(
  client: pg.Client,
  member: { id: number; email: string },
): Promise<string> {
  const code = generateCode();
  const salt = newSalt();
  await client.query(
    "insert into login_codes (email, member_id, code_hash, salt) values ($1,$2,$3,$4)",
    [member.email, member.id, hashCode(code, salt), salt],
  );
  return code;
}

/**
 * Checks a code against the newest live one. An unknown address returns the same
 * shape as a wrong code, so this cannot enumerate enrolled addresses.
 */
export async function redeemCode(
  client: pg.Client,
  email: string,
  submitted: string,
  now: Date,
): Promise<{ result: VerifyResult; memberId: number | null }> {
  const { rows } = await client.query(
    `select id, member_id, code_hash, salt, issued_at, attempts, consumed_at
       from login_codes where lower(email) = lower($1) order by issued_at desc limit 1`,
    [email.trim()],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) return { result: { kind: "wrong" }, memberId: null };

  const result = verifyCode(
    submitted,
    {
      codeHash: String(row["code_hash"]),
      salt: String(row["salt"]),
      issuedAt: new Date(String(row["issued_at"])),
      attempts: Number(row["attempts"]),
      consumedAt: row["consumed_at"] === null ? null : new Date(String(row["consumed_at"])),
    },
    now,
  );

  if (result.kind === "wrong") {
    await client.query("update login_codes set attempts = attempts + 1 where id = $1", [row["id"]]);
    return { result, memberId: null };
  }
  if (result.kind !== "ok") return { result, memberId: null };

  // Marked spent in the same statement that claims it, so two requests racing
  // the same code cannot both succeed.
  const claimed = await client.query(
    "update login_codes set consumed_at = now() where id = $1 and consumed_at is null returning id",
    [row["id"]],
  );
  if (claimed.rowCount === 0) return { result: { kind: "used" }, memberId: null };
  return { result, memberId: Number(row["member_id"]) };
}

/** A fresh id on every sign-in, so a pre-login id can never become authenticated. */
export async function startSession(client: pg.Client, memberId: number): Promise<string> {
  const id = randomUUID();
  await client.query("insert into member_sessions (id, member_id) values ($1,$2)", [id, memberId]);
  return id;
}

export async function endSession(client: pg.Client, sessionId: string): Promise<void> {
  await client.query(
    "update member_sessions set ended_at = now() where id = $1 and ended_at is null",
    [sessionId],
  );
}

/** The only way member data becomes reachable: no classifier can widen it. */
export interface SessionLookup {
  session: MemberSession | null;
  /** Why there is no session, when the reason is that one ran out. */
  ended: Exclude<SessionState, "live"> | null;
}

export async function currentSession(
  client: pg.Client,
  sessionId: string | null,
  now: Date,
): Promise<SessionLookup> {
  if (sessionId === null || !/^[0-9a-f-]{36}$/.test(sessionId)) {
    return { session: null, ended: null };
  }
  // Exempt from the policies, so it runs before an identity exists and supplies one.
  const { rows } = await client.query(
    `select id, member_id, created_at, last_seen_at from member_sessions
      where id = $1 and ended_at is null`,
    [sessionId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) return { session: null, ended: null };

  const state = sessionState(
    {
      createdAt: new Date(String(row["created_at"])),
      lastSeenAt: new Date(String(row["last_seen_at"])),
    },
    now,
  );
  if (state !== "live") {
    await endSession(client, sessionId);
    // Told apart from never having signed in, so the member can be
    // told their session ended rather than left to wonder.
    return { session: null, ended: state };
  }

  await client.query("update member_sessions set last_seen_at = now() where id = $1", [sessionId]);
  const memberId = Number(row["member_id"]);
  const displayName = await withMemberIdentity(client, memberId, async () => {
    const named = await client.query("select display_name from members where id = $1", [memberId]);
    const self = named.rows[0] as Record<string, unknown> | undefined;
    return self === undefined ? "your account" : String(self["display_name"]);
  });

  return { session: { sessionId, memberId, displayName }, ended: null };
}
