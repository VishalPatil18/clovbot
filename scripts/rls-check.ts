/**
 * Proves row-level security with no application code in the path. Earlier checks
 * called `loadMemberRecord` and so tested its `where` clause, which already passed.
 *
 *   npm run check:rls
 */
import { connect, connectAdmin } from "../src/rag/store.ts";
import type pg from "pg";

/** Every table whose rows belong to one member. */
const MEMBER_SCOPED = [
  { table: "members", column: "id" },
  { table: "member_accumulators", column: "member_id" },
  { table: "member_claims", column: "member_id" },
  { table: "member_prior_authorizations", column: "member_id" },
  { table: "member_appointments", column: "member_id" },
] as const;

/** No seeded fixture to leak, so only the coverage check below reaches these. */
const ALSO_POLICIED = ["member_access_log"] as const;

/** Deliberate exemptions, read by the schema check so each stays a decision. */
const EXEMPT: Record<string, string> = {
  login_codes: "read during sign-in, before an identity exists to filter by",
  member_sessions: "this table is what establishes the identity policies filter by",
};

const SELF = 1;
const OTHER = 2;

let failures = 0;
const fail = (message: string): void => {
  console.error(`  FAIL  ${message}`);
  failures += 1;
};
const pass = (message: string): void => console.log(`  ok    ${message}`);

async function identify(client: pg.Client, memberId: number | null): Promise<void> {
  await client.query("begin");
  if (memberId !== null) {
    await client.query("select set_config('clovbot.member_id', $1, true)", [String(memberId)]);
  }
}

async function rows(client: pg.Client, sql: string, params: unknown[] = []): Promise<number> {
  const result = await client.query(sql, params);
  return result.rowCount ?? 0;
}

const app = connect();
const admin = connectAdmin();
await app.connect();
await admin.connect();

try {
  console.log("\nrole");
  const { rows: attrs } = await app.query(
    "select current_user as name, rolbypassrls from pg_roles where rolname = current_user",
  );
  const role = attrs[0] as { name: string; rolbypassrls: boolean };
  if (role.rolbypassrls) fail(`${role.name} can bypass row-level security, so no policy binds it`);
  else pass(`${role.name} cannot bypass row-level security`);

  const { rows: owned } = await app.query(
    "select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user",
  );
  const ownedCount = (owned[0] as { n: number }).n;
  if (ownedCount > 0) fail(`${role.name} owns ${String(ownedCount)} tables and would bypass FORCE`);
  else pass(`${role.name} owns no table`);

  // The seed must hold both members, or "zero rows" proves nothing.
  console.log("\nfixture");
  for (const id of [SELF, OTHER]) {
    const n = await rows(admin, "select 1 from members where id = $1", [id]);
    if (n === 0) fail(`member ${String(id)} is not seeded; run npm run seed:members`);
    else pass(`member ${String(id)} exists`);
  }

  console.log(`\nreading as member ${String(SELF)}`);
  await identify(app, SELF);
  for (const { table, column } of MEMBER_SCOPED) {
    const leaked = await rows(app, `select 1 from ${table} where ${column} = $1`, [OTHER]);
    if (leaked > 0) fail(`${table}: ${String(leaked)} of member ${String(OTHER)}'s rows are visible`);
    else pass(`${table}: none of member ${String(OTHER)}'s rows are visible`);

    const own = await rows(app, `select 1 from ${table} where ${column} = $1`, [SELF]);
    if (own === 0) fail(`${table}: member ${String(SELF)} cannot read their own rows either`);
    else pass(`${table}: member ${String(SELF)} reads their own ${String(own)} rows`);

    // A policy that filters the predicate but not the table is not a policy.
    const all = await rows(app, `select 1 from ${table}`);
    if (all !== own) fail(`${table}: an unfiltered select returned ${String(all)} rows, not ${String(own)}`);
    else pass(`${table}: an unfiltered select returns only their own rows`);
  }
  await app.query("commit");

  // Absence of an identity is not a wildcard.
  console.log("\nreading with no identity set");
  for (const { table } of MEMBER_SCOPED) {
    const n = await rows(app, `select 1 from ${table}`);
    if (n > 0) fail(`${table}: ${String(n)} rows readable with no identity on the connection`);
    else pass(`${table}: zero rows`);
  }

  // The pooler reuses server connections, so an identity must not
  // outlive the transaction that set it.
  console.log("\nidentity does not outlive its transaction");
  await identify(app, SELF);
  await app.query("commit");
  const lingering = await rows(app, "select 1 from member_claims");
  if (lingering > 0) fail(`${String(lingering)} claims readable after the transaction committed`);
  else pass("the identity is gone once the transaction ends");

  // Enumerated from the catalog, not from this file's list, so a table
  // added later without a policy fails here rather than shipping unprotected.
  console.log("\nevery member-scoped table is covered");
  const { rows: candidates } = await admin.query(`
    select c.relname as table
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and (c.relname = 'members' or exists (
             select 1 from pg_attribute a
              where a.attrelid = c.oid and a.attname = 'member_id' and a.attnum > 0
           ))
     order by 1`);
  const declared = new Set<string>([
    ...MEMBER_SCOPED.map((entry) => entry.table),
    ...ALSO_POLICIED,
  ]);
  for (const row of candidates as { table: string }[]) {
    const name = row.table;
    if (declared.has(name)) continue;
    if (name in EXEMPT) {
      pass(`${name}: exempt, ${EXEMPT[name] ?? ""}`);
      continue;
    }
    fail(`${name} holds a member_id, has no policy, and is not a recorded exemption`);
  }

  const { rows: policied } = await admin.query(`
    select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
           count(p.polname)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
     where n.nspname = 'public' and c.relname = any($1)
     group by 1, 2, 3`,
    [[...MEMBER_SCOPED.map((entry) => entry.table), ...ALSO_POLICIED]],
  );
  for (const row of policied as { table: string; enabled: boolean; forced: boolean; policies: number }[]) {
    if (!row.enabled) fail(`${row.table}: row-level security is not enabled`);
    else if (!row.forced) fail(`${row.table}: FORCE is off, so the owning role reads every row`);
    else if (row.policies === 0) fail(`${row.table}: enabled with no policy, which denies everything`);
    else pass(`${row.table}: enabled, forced, ${String(row.policies)} policy`);
  }

  // An empty table passes for the wrong reason, so run the same query as the
  // owner: rows here and none above means the difference is the policy.
  // Disabling security to watch a leak needs a lock, and is a hazard if its
  // rollback ever fails to run.
  console.log("\nthe empty result above is the policy, not an empty table");
  await identify(app, OTHER);
  for (const { table, column } of MEMBER_SCOPED) {
    const found = await rows(app, `select 1 from ${table} where ${column} = $1`, [OTHER]);
    if (found === 0) {
      fail(`${table}: member ${String(OTHER)} has no rows, so reading zero of them proves nothing`);
    } else {
      pass(`${table}: the identical query returns ${String(found)} rows as member ${String(OTHER)}`);
    }
  }
  await app.query("commit");
} catch (error) {
  // The likeliest cause by far, and the one worth naming rather than tracing.
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`\n  stopped: ${detail}`);
  if (/permission denied/.test(detail)) {
    console.error("  apply migrations/011_row_level_security.sql as the admin role first.");
  }
  failures += 1;
} finally {
  await app.end().catch(() => {});
  await admin.end().catch(() => {});
}

console.log("");
if (failures > 0) {
  console.error(`${String(failures)} row-level security check(s) failed`);
  process.exit(1);
}
console.log("row-level security holds: no member's rows are reachable from another's session");
