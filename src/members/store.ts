import type pg from "pg";
import type { RerankedChunk } from "../rag/rerank.ts";
import type { MemberTopic } from "../auth/login-required.ts";
import { partDStage, type DrugThresholds } from "./stage.ts";

/**
 * One column of one row, named so an audit record can say what was read
 * without holding what it said. Rendered as `member_claims.member_owes@CLM-0031`.
 * D-092, FR-P3-18.
 */
export interface FieldRead {
  table: string;
  column: string;
  rowId: string;
}

export const formatFieldRead = (read: FieldRead): string =>
  `${read.table}.${read.column}@${read.rowId}`;

/** One fact from a member's record, ready to be cited. */
export interface MemberFact {
  /** What the citation names: "Claim CLM-0031", "Prior authorisation PA-0114". */
  item: string;
  /** The field, written as a member would say it: "What you owe". */
  field: string;
  text: string;
  /**
   * The columns this fact was built from. The audit record is derived from
   * these rather than compiled separately, so what is logged and what is
   * answered cannot drift apart. FR-P3-22.
   */
  sources: FieldRead[];
}

export interface MemberRecord {
  id: number;
  contractId: string;
  planId: string;
  planYear: number;
  facts: MemberFact[];
}

const money = (value: unknown): string => `$${Number(value).toFixed(2).replace(/\.00$/, "")}`;
const day = (value: unknown): string => new Date(String(value)).toISOString().slice(0, 10);

/**
 * The columns each topic needs, and no others. FR-P3-14.
 *
 * `members` is read on every topic because a citation cannot be built without
 * the plan it belongs to. `display_name` is on no list: nothing in an answer
 * addresses the member by name, so nothing reads it. D-091.
 */
const IDENTITY_COLUMNS = ["id", "contract_id", "plan_id", "plan_year"] as const;

const CLAIM_COLUMNS =
  "id, service_description, provider, service_date, billed, plan_paid, member_owes, status";
const PRIOR_AUTH_COLUMNS = "id, requested_service, requested_date, status, decision_date";
const APPOINTMENT_COLUMNS = "id, specialty, provider, visit_date";
const ACCUMULATOR_COLUMNS =
  "oop_max_used_ytd, oop_max_limit, drug_spend_ytd, dental_limit, dental_remaining, " +
  "otc_limit, otc_remaining, hearing_limit, hearing_remaining, vision_limit, vision_remaining";

/** Extra members columns a topic needs beyond plan identity. */
const MEMBER_COLUMNS: Record<MemberTopic, readonly string[]> = {
  claim: [],
  prior_authorization: [],
  appointment: [],
  provider: ["assigned_provider", "assigned_specialty"],
  balance: ["drug_deductible", "out_of_pocket_limit"],
};

const sourcesFor = (table: string, columns: string, rowId: string): FieldRead[] =>
  columns.split(",").map((column) => ({ table, column: column.trim(), rowId }));

/**
 * Puts the member's identity on the connection for the length of one
 * transaction, which is what the row-level security policies filter by.
 *
 * Transaction-local rather than a session SET: the pooler hands this server
 * connection to whichever request comes next, and a lingering identity would
 * travel with it. D-090, FR-P3-05.
 */
export async function withMemberIdentity<T>(
  client: pg.Client,
  memberId: number,
  read: () => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query("select set_config('clovbot.member_id', $1, true)", [String(memberId)]);
    const result = await read();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/**
 * The facts one topic needs from one member's record, and nothing else.
 *
 * Scoping lives here rather than in the prompt: a prompt cannot be relied on to
 * keep one member's data away from another. D-080. Since P3 the database
 * enforces it too, and these clauses are defence in depth rather than the
 * boundary. FR-P3-08.
 *
 * The topic comes from the same rule that decides whether a signed-out member
 * must sign in, so the gate and the read cannot disagree. D-091, FR-P3-16.
 */
export async function loadMemberRecord(
  client: pg.Client,
  memberId: number,
  topic: MemberTopic,
): Promise<MemberRecord | null> {
  return withMemberIdentity(client, memberId, () => readMemberRecord(client, memberId, topic));
}

async function readMemberRecord(
  client: pg.Client,
  memberId: number,
  topic: MemberTopic,
): Promise<MemberRecord | null> {
  const columns = [...IDENTITY_COLUMNS, ...MEMBER_COLUMNS[topic]].join(", ");
  const { rows: members } = await client.query(
    `select ${columns} from members where id = $1`,
    [memberId],
  );
  const member = members[0] as Record<string, unknown> | undefined;
  if (member === undefined) return null;

  const record: MemberRecord = {
    id: Number(member["id"]),
    contractId: String(member["contract_id"]),
    planId: String(member["plan_id"]),
    planYear: Number(member["plan_year"]),
    facts: [],
  };
  const self = String(memberId);

  if (topic === "provider") {
    record.facts.push({
      item: "Your care team",
      field: "Assigned provider",
      text:
        `The assigned primary care provider is ${String(member["assigned_provider"])} ` +
        `(${String(member["assigned_specialty"])}). This is demonstration data.`,
      sources: sourcesFor("members", "assigned_provider, assigned_specialty", self),
    });
  }

  if (topic === "balance") {
    const { rows } = await client.query(
      `select ${ACCUMULATOR_COLUMNS} from member_accumulators where member_id = $1`,
      [memberId],
    );
    const acc = rows[0] as Record<string, unknown> | undefined;
    if (acc !== undefined) {
      const thresholds: DrugThresholds = {
        drugDeductible: Number(member["drug_deductible"]),
        outOfPocketLimit: Number(member["out_of_pocket_limit"]),
      };
      const spend = Number(acc["drug_spend_ytd"]);
      record.facts.push(
        {
          item: "Accumulators",
          field: "Out-of-pocket maximum used this year",
          text:
            `${money(acc["oop_max_used_ytd"])} of the ${money(acc["oop_max_limit"])} ` +
            "in-network out-of-pocket maximum has been used this year.",
          sources: sourcesFor("member_accumulators", "oop_max_used_ytd, oop_max_limit", self),
        },
        {
          item: "Accumulators",
          field: "Drug payment stage",
          // Derived, never stored: a stage beside a spend that disagrees with it
          // is the contradiction D-081 exists to prevent.
          text:
            `Drug spending this year is ${money(spend)}, which is the ` +
            `${partDStage(spend, thresholds)} stage on this plan ` +
            `(deductible ${money(thresholds.drugDeductible)}, ` +
            `out-of-pocket limit ${money(thresholds.outOfPocketLimit)}).`,
          sources: [
            ...sourcesFor("member_accumulators", "drug_spend_ytd", self),
            ...sourcesFor("members", "drug_deductible, out_of_pocket_limit", self),
          ],
        },
      );
      for (const [name, key] of [
        ["Dental", "dental"],
        ["Over-the-counter", "otc"],
        ["Hearing", "hearing"],
        ["Vision", "vision"],
      ] as const) {
        record.facts.push({
          item: "Accumulators",
          field: `${name} allowance left`,
          text:
            `${money(acc[`${key}_remaining`])} of the ${money(acc[`${key}_limit`])} ` +
            `${name.toLowerCase()} allowance is left this year.`,
          sources: sourcesFor("member_accumulators", `${key}_limit, ${key}_remaining`, self),
        });
      }
    }
  }

  if (topic === "claim") {
    const { rows } = await client.query(
      `select ${CLAIM_COLUMNS} from member_claims where member_id = $1 order by service_date desc`,
      [memberId],
    );
    for (const row of rows as Record<string, unknown>[]) {
      const id = String(row["id"]);
      record.facts.push({
        item: `Claim ${id}`,
        field: "What you owe",
        text:
          `${String(row["service_description"])} with ${String(row["provider"])} on ` +
          `${day(row["service_date"])}. Billed ${money(row["billed"])}, the plan paid ` +
          `${money(row["plan_paid"])}, and ${money(row["member_owes"])} is owed. ` +
          `Status: ${String(row["status"])}.`,
        sources: sourcesFor("member_claims", CLAIM_COLUMNS, id),
      });
    }
  }

  if (topic === "prior_authorization") {
    const { rows } = await client.query(
      `select ${PRIOR_AUTH_COLUMNS} from member_prior_authorizations
        where member_id = $1 order by requested_date desc`,
      [memberId],
    );
    for (const row of rows as Record<string, unknown>[]) {
      const id = String(row["id"]);
      const decided = row["decision_date"];
      record.facts.push({
        item: `Prior authorisation ${id}`,
        field: "Status",
        text:
          `${String(row["requested_service"])}, requested ${day(row["requested_date"])}. ` +
          `Status: ${String(row["status"])}` +
          (decided === null ? ", no decision yet." : `, decided ${day(decided)}.`),
        sources: sourcesFor("member_prior_authorizations", PRIOR_AUTH_COLUMNS, id),
      });
    }
  }

  if (topic === "appointment") {
    const { rows } = await client.query(
      `select ${APPOINTMENT_COLUMNS} from member_appointments
        where member_id = $1 order by visit_date desc`,
      [memberId],
    );
    for (const row of rows as Record<string, unknown>[]) {
      const id = String(row["id"]);
      record.facts.push({
        item: `Appointment ${id}`,
        field: "Visit",
        text:
          `${String(row["specialty"])} with ${String(row["provider"])} on ${day(row["visit_date"])}.`,
        sources: sourcesFor("member_appointments", APPOINTMENT_COLUMNS, id),
      });
    }
  }

  return record;
}

/**
 * Which plan a member is on, and nothing else.
 *
 * Retrieval cannot be scoped without it, so it is read for every question a
 * member asks, including ones that touch no record field. It holds no protected
 * value: the contract and plan are printed on the member's own ID card.
 */
export async function loadMemberPlan(
  client: pg.Client,
  memberId: number,
): Promise<{ contractId: string; planId: string; planYear: number } | null> {
  return withMemberIdentity(client, memberId, async () => {
    const { rows } = await client.query(
      `select ${IDENTITY_COLUMNS.join(", ")} from members where id = $1`,
      [memberId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) return null;
    return {
      contractId: String(row["contract_id"]),
      planId: String(row["plan_id"]),
      planYear: Number(row["plan_year"]),
    };
  });
}

/** Every column the facts were built from, deduplicated and ordered. FR-P3-17. */
export function fieldsRead(record: MemberRecord | null): string[] {
  if (record === null) return [];
  const names = record.facts.flatMap((fact) => fact.sources.map(formatFieldRead));
  return [...new Set(names)].sort();
}

/** An exact record field outranks anything the reranker can score. */
const EXACT_MATCH_SCORE = 1;

/**
 * A record fact rendered as a citable source, so a member answer travels the
 * same prompt, citation and cite-or-refuse path as a document answer, and a
 * combined answer carries both kinds. FR-P2-28, FR-P2-29, D-080.
 */
export function memberFactAsChunk(record: MemberRecord, fact: MemberFact): RerankedChunk {
  return {
    id: `member-${String(record.id)}-${fact.item}-${fact.field}`.replace(/[^a-zA-Z0-9-]+/g, "-"),
    documentId: fact.item,
    kind: "member_record",
    contractId: record.contractId,
    planId: record.planId,
    planYear: record.planYear,
    section: fact.field,
    content: `${fact.text} This is a synthetic demonstration record.`,
    distance: 0,
    rerankScore: EXACT_MATCH_SCORE,
  };
}

export interface AccessRecord {
  memberId: number;
  sessionId: string | null;
  topic: MemberTopic | null;
  /** Already redacted by the caller, exactly as the turn log is. FR-P3-23. */
  question: string;
  fieldsRead: string[];
  outcome: string;
}

/**
 * One row per authenticated turn, whatever the outcome. FR-P3-17, FR-P3-20.
 *
 * Insert only: the role holds no update or delete on this table, so a code path
 * that tried to rewrite history would be refused by the database. FR-P3-21.
 */
export async function writeAccessLog(client: pg.Client, entry: AccessRecord): Promise<void> {
  await withMemberIdentity(client, entry.memberId, async () => {
    await client.query(
      `insert into member_access_log
         (member_id, session_id, topic, question, fields_read, outcome)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        entry.memberId,
        entry.sessionId,
        entry.topic,
        entry.question,
        entry.fieldsRead,
        entry.outcome,
      ],
    );
  });
}
