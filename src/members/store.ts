import type pg from "pg";
import type { RerankedChunk } from "../rag/rerank.ts";
import { partDStage, type DrugThresholds } from "./stage.ts";

/** One fact from a member's record, ready to be cited. */
export interface MemberFact {
  /** What the citation names: "Claim CLM-0031", "Prior authorisation PA-0114". */
  item: string;
  /** The field, written as a member would say it: "What you owe". */
  field: string;
  text: string;
}

export interface MemberRecord {
  id: number;
  displayName: string;
  contractId: string;
  planId: string;
  planYear: number;
  facts: MemberFact[];
}

const money = (value: unknown): string => `$${Number(value).toFixed(2).replace(/\.00$/, "")}`;
const day = (value: unknown): string => new Date(String(value)).toISOString().slice(0, 10);

/**
 * Puts the member's identity on the connection for the length of one
 * transaction, which is what the row-level security policies filter by.
 *
 * Transaction-local rather than a session SET: the pooler hands this server
 * connection to whichever request comes next, and a lingering identity would
 * travel with it. D-090, FR-P3-05.
 */
async function withMemberIdentity<T>(
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
 * Every fact in one member's record, scoped by member id in every query.
 *
 * Scoping lives here rather than in the prompt: a prompt cannot be relied on to
 * keep one member's data away from another. D-080. Since P3 the database
 * enforces it too, and these clauses are defence in depth rather than the
 * boundary. FR-P3-08.
 */
export async function loadMemberRecord(
  client: pg.Client,
  memberId: number,
): Promise<MemberRecord | null> {
  return withMemberIdentity(client, memberId, () => readMemberRecord(client, memberId));
}

async function readMemberRecord(
  client: pg.Client,
  memberId: number,
): Promise<MemberRecord | null> {
  const { rows: members } = await client.query(
    `select id, display_name, contract_id, plan_id, plan_year, assigned_provider,
            assigned_specialty, drug_deductible, out_of_pocket_limit
       from members where id = $1`,
    [memberId],
  );
  const member = members[0] as Record<string, unknown> | undefined;
  if (member === undefined) return null;

  // Sequential, not Promise.all: one pg client executes one query at a time and
  // deprecates overlapping calls.
  const accumulators = await client.query(
    "select * from member_accumulators where member_id = $1",
    [memberId],
  );
  const claims = await client.query(
    "select * from member_claims where member_id = $1 order by service_date desc",
    [memberId],
  );
  const priorAuths = await client.query(
    "select * from member_prior_authorizations where member_id = $1 order by requested_date desc",
    [memberId],
  );
  const appointments = await client.query(
    "select * from member_appointments where member_id = $1 order by visit_date desc",
    [memberId],
  );

  const facts: MemberFact[] = [
    {
      item: "Enrolment",
      field: "Your plan",
      text:
        `${String(member["display_name"])} is enrolled in ${String(member["contract_id"])}-` +
        `${String(member["plan_id"])} for plan year ${String(member["plan_year"])}.`,
    },
    {
      item: "Your care team",
      field: "Assigned provider",
      text:
        `The assigned primary care provider is ${String(member["assigned_provider"])} ` +
        `(${String(member["assigned_specialty"])}). This is demonstration data.`,
    },
  ];

  const acc = accumulators.rows[0] as Record<string, unknown> | undefined;
  if (acc !== undefined) {
    const thresholds: DrugThresholds = {
      drugDeductible: Number(member["drug_deductible"]),
      outOfPocketLimit: Number(member["out_of_pocket_limit"]),
    };
    const spend = Number(acc["drug_spend_ytd"]);
    facts.push(
      {
        item: "Accumulators",
        field: "Out-of-pocket maximum used this year",
        text:
          `${money(acc["oop_max_used_ytd"])} of the ${money(acc["oop_max_limit"])} ` +
          "in-network out-of-pocket maximum has been used this year.",
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
      },
    );
    for (const [name, limit, remaining] of [
      ["Dental", acc["dental_limit"], acc["dental_remaining"]],
      ["Over-the-counter", acc["otc_limit"], acc["otc_remaining"]],
      ["Hearing", acc["hearing_limit"], acc["hearing_remaining"]],
      ["Vision", acc["vision_limit"], acc["vision_remaining"]],
    ] as const) {
      facts.push({
        item: "Accumulators",
        field: `${name} allowance left`,
        text: `${money(remaining)} of the ${money(limit)} ${name.toLowerCase()} allowance is left this year.`,
      });
    }
  }

  for (const row of claims.rows as Record<string, unknown>[]) {
    facts.push({
      item: `Claim ${String(row["id"])}`,
      field: "What you owe",
      text:
        `${String(row["service_description"])} with ${String(row["provider"])} on ` +
        `${day(row["service_date"])}. Billed ${money(row["billed"])}, the plan paid ` +
        `${money(row["plan_paid"])}, and ${money(row["member_owes"])} is owed. ` +
        `Status: ${String(row["status"])}.`,
    });
  }

  for (const row of priorAuths.rows as Record<string, unknown>[]) {
    const decided = row["decision_date"];
    facts.push({
      item: `Prior authorisation ${String(row["id"])}`,
      field: "Status",
      text:
        `${String(row["requested_service"])}, requested ${day(row["requested_date"])}. ` +
        `Status: ${String(row["status"])}` +
        (decided === null ? ", no decision yet." : `, decided ${day(decided)}.`),
    });
  }

  for (const row of appointments.rows as Record<string, unknown>[]) {
    facts.push({
      item: `Appointment ${String(row["id"])}`,
      field: "Visit",
      text:
        `${String(row["specialty"])} with ${String(row["provider"])} on ${day(row["visit_date"])}.`,
    });
  }

  return {
    id: Number(member["id"]),
    displayName: String(member["display_name"]),
    contractId: String(member["contract_id"]),
    planId: String(member["plan_id"]),
    planYear: Number(member["plan_year"]),
    facts,
  };
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
