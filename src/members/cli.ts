import { redactIdentifiers } from "../logging.ts";
import { findPlanRef, formatPlanRef } from "../corpus/scope.ts";
import { answerTurn } from "../rag/answer-turn.ts";
import { citationLabel } from "../rag/payload.ts";
import { connect, writeTurn } from "../rag/store.ts";
import { latestSnapshotId } from "../corpus/snapshot.ts";
import { SEED_MEMBERS } from "./seed.ts";
import { loadMemberRecord } from "./store.ts";

const flags = new Map<string, string>();
const words: string[] = [];
for (let i = 3; i < process.argv.length; i += 1) {
  const argument = process.argv[i] ?? "";
  const match = /^--([^=]+)=(.*)$/.exec(argument);
  if (match?.[1] !== undefined) {
    flags.set(match[1], match[2] ?? "");
    continue;
  }
  if (argument.startsWith("--")) {
    flags.set(argument.slice(2), process.argv[i + 1] ?? "");
    i += 1;
    continue;
  }
  words.push(argument);
}

/** D-047: every row is invented, and the schema refuses anything else. */
async function seed(): Promise<void> {
  const client = connect();
  await client.connect();
  try {
    await client.query("begin");
    for (const member of SEED_MEMBERS) {
      await client.query(
        `insert into members (id, display_name, email, contract_id, plan_id, plan_year,
           effective_date, assigned_provider, assigned_specialty, drug_deductible, out_of_pocket_limit)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (id) do update set
           display_name = excluded.display_name, email = excluded.email,
           contract_id = excluded.contract_id, plan_id = excluded.plan_id,
           plan_year = excluded.plan_year, effective_date = excluded.effective_date,
           assigned_provider = excluded.assigned_provider,
           assigned_specialty = excluded.assigned_specialty,
           drug_deductible = excluded.drug_deductible,
           out_of_pocket_limit = excluded.out_of_pocket_limit`,
        [
          member.id, member.displayName, member.email, member.contractId, member.planId,
          member.planYear, member.effectiveDate, member.assignedProvider,
          member.assignedSpecialty, member.drugDeductible, member.outOfPocketLimit,
        ],
      );

      const a = member.accumulators;
      await client.query(
        `insert into member_accumulators (member_id, oop_max_limit, oop_max_used_ytd,
           drug_spend_ytd, dental_limit, dental_remaining, otc_limit, otc_remaining,
           hearing_limit, hearing_remaining, vision_limit, vision_remaining)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (member_id) do update set
           oop_max_limit = excluded.oop_max_limit, oop_max_used_ytd = excluded.oop_max_used_ytd,
           drug_spend_ytd = excluded.drug_spend_ytd,
           dental_limit = excluded.dental_limit, dental_remaining = excluded.dental_remaining,
           otc_limit = excluded.otc_limit, otc_remaining = excluded.otc_remaining,
           hearing_limit = excluded.hearing_limit, hearing_remaining = excluded.hearing_remaining,
           vision_limit = excluded.vision_limit, vision_remaining = excluded.vision_remaining`,
        [
          member.id, a.oopMaxLimit, a.oopMaxUsedYtd, a.drugSpendYtd,
          a.dental[0], a.dental[1], a.otc[0], a.otc[1],
          a.hearing[0], a.hearing[1], a.vision[0], a.vision[1],
        ],
      );

      // Replaced rather than merged, so a re-seed cannot leave a stale row behind.
      for (const table of ["member_claims", "member_prior_authorizations", "member_appointments"]) {
        await client.query(`delete from ${table} where member_id = $1`, [member.id]);
      }
      for (const c of member.claims) {
        await client.query(
          `insert into member_claims (id, member_id, service_date, provider,
             service_description, billed, plan_paid, member_owes, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [c.id, member.id, c.serviceDate, c.provider, c.serviceDescription,
           c.billed, c.planPaid, c.memberOwes, c.status],
        );
      }
      for (const pa of member.priorAuthorizations) {
        await client.query(
          `insert into member_prior_authorizations (id, member_id, requested_service,
             requested_date, status, decision_date)
           values ($1,$2,$3,$4,$5,$6)`,
          [pa.id, member.id, pa.requestedService, pa.requestedDate, pa.status, pa.decisionDate],
        );
      }
      for (const apt of member.appointments) {
        await client.query(
          `insert into member_appointments (id, member_id, visit_date, provider, specialty)
           values ($1,$2,$3,$4,$5)`,
          [apt.id, member.id, apt.visitDate, apt.provider, apt.specialty],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
  console.log(`seeded ${String(SEED_MEMBERS.length)} synthetic members`);
}

async function ask(): Promise<void> {
  const id = Number(flags.get("id"));
  const question = words.join(" ").trim();
  if (!Number.isInteger(id) || question.length === 0) {
    throw new Error('usage: npm run ask:member -- --id=1 "what did my last claim cost"');
  }

  const client = connect();
  await client.connect();
  try {
    const record = await loadMemberRecord(client, id);
    if (record === null) {
      throw new Error(`no member ${String(id)}. Run npm run seed:members first.`);
    }
    const planRef = findPlanRef(record.contractId, record.planId);
    if (planRef === null) {
      throw new Error(`member ${String(id)} is on ${record.contractId}-${record.planId}, which is not indexed`);
    }

    console.log(`\n${record.displayName} · ${formatPlanRef(planRef)} · synthetic record\n`);
    const turn = await answerTurn(client, question, planRef, { memberId: id });
    console.log(`${turn.answer}\n`);
    if (turn.citedIds.length > 0) {
      console.log("Sources:");
      for (const cited of turn.citedIds) {
        const chunk = turn.retrieved.find((candidate) => candidate.id === cited);
        if (chunk !== undefined) console.log(`  ${citationLabel(chunk)}`);
      }
    }

    await writeTurn(client, {
      question: redactIdentifiers(turn.question),
      planContext: formatPlanRef(planRef),
      route: turn.route.paths.join("+"),
      routeReason: turn.route.reason,
      chunkIds: turn.retrieved.map((chunk) => chunk.id),
      corpusSnapshotId: latestSnapshotId(),
      outcome: turn.outcome,
      provider: turn.provider,
      latencyMs: turn.latencyMs,
      refusalTrigger: turn.refusalTrigger,
    });
  } finally {
    await client.end();
  }
}

const command = process.argv[2];
if (command === "seed") await seed();
else if (command === "ask") await ask();
else throw new Error(`unknown command ${String(command)}. Use seed or ask.`);
