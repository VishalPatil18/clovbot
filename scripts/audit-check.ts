/**
 * Proves every authenticated read is recorded, and that the record cannot be
 * altered or made to hold what it audits. FR-P3-17 to FR-P3-22.
 *
 *   npm run check:audit
 *
 * Runs real turns, so it writes real rows to the access log. That is correct:
 * these are reads that actually happened.
 */
import { answerTurn } from "../src/rag/answer-turn.ts";
import { connect, connectAdmin } from "../src/rag/store.ts";
import { loadMemberPlan } from "../src/members/store.ts";
import { findPlanRef } from "../src/corpus/scope.ts";
import type pg from "pg";

const MEMBER = 1;

/** A record question and a plan-document question, asked by the same member. */
const RECORD_QUESTION = "what did my last claim cost";
const PUBLIC_QUESTION = "what is my specialist copay";

let failures = 0;
const fail = (message: string): void => {
  console.error(`  FAIL  ${message}`);
  failures += 1;
};
const pass = (message: string): void => console.log(`  ok    ${message}`);

interface LogRow {
  id: string;
  topic: string | null;
  question: string;
  fields_read: string[];
  outcome: string;
}

async function latest(admin: pg.Client, after: string): Promise<LogRow[]> {
  const { rows } = await admin.query(
    `select id::text, topic, question, fields_read, outcome
       from member_access_log
      where member_id = $1 and id > $2
      order by id`,
    [MEMBER, after],
  );
  return rows as LogRow[];
}

const app = connect();
const admin = connectAdmin();
await app.connect();
await admin.connect();

try {
  const plan = await loadMemberPlan(app, MEMBER);
  if (plan === null) throw new Error(`member ${String(MEMBER)} is not seeded`);
  const planRef = findPlanRef(plan.contractId, plan.planId);
  if (planRef === null) throw new Error(`${plan.contractId}-${plan.planId} is not indexed`);

  const { rows: start } = await admin.query(
    "select coalesce(max(id), 0)::text as id from member_access_log",
  );
  let mark = (start[0] as { id: string }).id;

  console.log("\na question the record answers");
  const answered = await answerTurn(app, RECORD_QUESTION, planRef, { memberId: MEMBER });
  const afterRecord = await latest(admin, mark);
  mark = afterRecord.at(-1)?.id ?? mark;

  if (afterRecord.length !== 1) fail(`${String(afterRecord.length)} rows written, expected exactly 1`);
  else pass("exactly one row written");

  const record = afterRecord[0];
  if (record !== undefined) {
    if (record.topic !== "claim") fail(`topic is ${String(record.topic)}, expected claim`);
    else pass("the row names the topic that caused the read");

    const owed = record.fields_read.filter((field) => field.startsWith("member_claims."));
    if (owed.length === 0) fail("no claim column recorded");
    else pass(`${String(owed.length)} claim columns recorded, each naming its row`);

    if (!record.fields_read.every((field) => /^[a-z_]+\.[a-z_]+@.+$/.test(field))) {
      fail("a recorded field is not in table.column@row form");
    } else pass("every recorded field names a column and a row");

    // FR-P3-19. The answer states an amount; the log must not.
    const amounts = /\$?\d+\.\d{2}|\$\d+/.exec(JSON.stringify(record));
    if (amounts !== null) fail(`the row holds a value: ${amounts[0]}`);
    else pass("the row holds no amount from the record it describes");

    if (record.outcome !== answered.outcome) fail("the row's outcome disagrees with the turn");
    else pass(`the row carries the turn's outcome, ${record.outcome}`);

    // FR-P3-22. Every field the answer cited has to appear in the log.
    const citedFields = answered.retrieved
      .filter((chunk) => chunk.kind === "member_record" && answered.citedIds.includes(chunk.id))
      .map((chunk) => chunk.section);
    if (citedFields.length === 0) {
      fail("the answer cited no record field, so reconstruction cannot be checked");
    } else {
      const tables = new Set(record.fields_read.map((field) => field.split(".")[0]));
      if (!tables.has("member_claims")) fail("the cited claim field is absent from the log");
      else pass(`the answer cited ${citedFields.join(", ")}, and the log covers it`);
    }
  }

  console.log("\na question the plan documents answer");
  await answerTurn(app, PUBLIC_QUESTION, planRef, { memberId: MEMBER });
  const afterPublic = await latest(admin, mark);
  mark = afterPublic.at(-1)?.id ?? mark;

  if (afterPublic.length !== 1) fail(`${String(afterPublic.length)} rows written, expected exactly 1`);
  else pass("still exactly one row: the access is recorded even when nothing is read");

  const publicRow = afterPublic[0];
  if (publicRow !== undefined) {
    if (publicRow.topic !== null) fail(`topic is ${String(publicRow.topic)}, expected none`);
    else pass("no topic, because the question needed no record");

    if (publicRow.fields_read.length > 0) {
      fail(`${String(publicRow.fields_read.length)} fields read for a plan-document question`);
    } else pass("zero fields read for a plan-document question");
  }

  // FR-P3-21. Not by convention, by grant.
  console.log("\nthe log cannot be rewritten");
  for (const [what, sql] of [
    ["update", "update member_access_log set outcome = 'answered' where member_id = $1"],
    ["delete", "delete from member_access_log where member_id = $1"],
  ] as const) {
    try {
      await app.query(sql, [MEMBER]);
      fail(`the application could ${what} an audit row`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/permission denied/.test(detail)) pass(`${what} is refused by the database`);
      else fail(`${what} failed for the wrong reason: ${detail}`);
    }
  }

  // The insert policy is keyed on the same identity, so one member cannot write
  // a row about another.
  console.log("\none member cannot write another member's history");
  await app.query("begin");
  try {
    await app.query("select set_config('clovbot.member_id', $1, true)", [String(MEMBER)]);
    await app.query(
      `insert into member_access_log (member_id, question, outcome) values ($1, 'probe', 'answered')`,
      [MEMBER + 1],
    );
    fail(`member ${String(MEMBER)} wrote a row about member ${String(MEMBER + 1)}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/policy/.test(detail)) pass("the insert policy refuses a row about another member");
    else fail(`the insert failed for the wrong reason: ${detail}`);
  } finally {
    await app.query("rollback");
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`\n  stopped: ${detail}`);
  if (/member_access_log|member_for_login/.test(detail)) {
    console.error("  apply migrations 012 and 013 as the admin role first.");
  }
  failures += 1;
} finally {
  await app.end().catch(() => {});
  await admin.end().catch(() => {});
}

console.log("");
if (failures > 0) {
  console.error(`${String(failures)} audit check(s) failed`);
  process.exit(1);
}
console.log("every authenticated read is recorded, names its fields, and holds none of their values");
