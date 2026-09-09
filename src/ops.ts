import { connectAdmin, readChunksByIds, readTurn } from "./rag/store.ts";

/** Command line only: both read the turn log, which holds redacted questions. */

async function reproduce(turnId: string): Promise<void> {
  const client = connectAdmin();
  await client.connect();
  try {
    const turn = await readTurn(client, turnId);
    if (turn === null) {
      console.error(`no turn ${turnId}`);
      process.exitCode = 1;
      return;
    }

    console.log(`turn      ${turn.id}`);
    console.log(`question  ${turn.question}`);
    console.log(`plan      ${turn.planContext ?? "none"}`);
    console.log(`outcome   ${turn.outcome}`);
    console.log(`snapshot  ${turn.corpusSnapshotId}`);
    console.log(`chunks    ${turn.chunkIds.length}`);

    const chunks = await readChunksByIds(client, turn.chunkIds, turn.corpusSnapshotId);
    // A chunk that cannot be found is the finding, not an inconvenience: it means
    // the snapshot it was retrieved from no longer holds it.
    const missing = turn.chunkIds.filter((id) => !chunks.some((chunk) => chunk.id === id));

    console.log("\nretrieved context, in the order it was retrieved:\n");
    for (const [index, chunk] of chunks.entries()) {
      console.log(`  [${index + 1}] ${chunk.id}`);
      console.log(`      ${chunk.documentId} · ${chunk.section}`);
      console.log(`      ${chunk.content.replace(/\n/g, " ").slice(0, 160)}`);
      console.log("");
    }

    if (missing.length > 0) {
      console.log(`  ${missing.length} chunk(s) no longer in snapshot ${turn.corpusSnapshotId}:`);
      for (const id of missing) console.log(`    ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`reproduced ${chunks.length} of ${turn.chunkIds.length} chunks exactly`);
  } finally {
    await client.end();
  }
}

async function insights(days: number): Promise<void> {
  const client = connectAdmin();
  await client.connect();
  try {
    const since = `${days} days`;
    const one = async (sql: string): Promise<Record<string, unknown>[]> =>
      (await client.query(sql, [since])).rows;

    const totals = await one(
      `select outcome, count(*) n from turns
        where asked_at > now() - $1::interval group by outcome order by n desc`,
    );
    const answered = Number(totals.find((row) => row["outcome"] === "answered")?.["n"] ?? 0);
    const refused = Number(totals.find((row) => row["outcome"] === "refused")?.["n"] ?? 0);
    const failed = Number(totals.find((row) => row["outcome"] === "upstream_failure")?.["n"] ?? 0);
    const scored = answered + refused;

    console.log(`\nLast ${days} days\n`);
    console.log(`  answered            ${answered}`);
    console.log(`  refused             ${refused}`);
    console.log(`  upstream failures   ${failed}   (excluded from the refusal rate, FR-25)`);
    console.log(
      `  containment         ${scored === 0 ? "n/a" : `${((answered / scored) * 100).toFixed(1)}%`}`,
    );

    const triggers = await one(
      `select refusal_trigger, count(*) n from turns
        where asked_at > now() - $1::interval and refusal_trigger is not null
        group by refusal_trigger order by n desc limit 12`,
    );
    console.log("\n  Why it refused");
    if (triggers.length === 0) console.log("    nothing refused");
    for (const row of triggers) {
      console.log(`    ${String(row["refusal_trigger"]).padEnd(24)} ${row["n"]}`);
    }

    // The list that says where the corpus is thin. A high
    // refusal rate as a corpus deficiency to fix, and this is how it is found.
    const unanswered = await one(
      `select question, count(*) n from turns
        where asked_at > now() - $1::interval and outcome = 'refused'
        group by question order by n desc, question limit 15`,
    );
    console.log("\n  Top unanswered questions");
    if (unanswered.length === 0) console.log("    none");
    for (const row of unanswered) {
      console.log(`    ${String(row["n"]).padStart(3)}  ${String(row["question"]).slice(0, 88)}`);
    }

    const feedback = await one(
      `select member_feedback, count(*) n from turns
        where asked_at > now() - $1::interval and member_feedback is not null
        group by member_feedback`,
    );
    const yes = Number(feedback.find((row) => row["member_feedback"] === "resolved")?.["n"] ?? 0);
    const no = Number(feedback.find((row) => row["member_feedback"] === "not_resolved")?.["n"] ?? 0);
    console.log("\n  Did this answer your question?");
    console.log(`    yes ${yes}   no ${no}   ${yes + no === 0 ? "(no responses yet)" : ""}`);

    // Through the view, which drops the session id the loop breaker still needs.
    const reasons = await one(
      `select feedback_reason, count(*) n from feedback_report
        where asked_at > now() - $1::interval and feedback_reason is not null
        group by feedback_reason order by n desc`,
    );
    if (reasons.length > 0) {
      console.log("\n  Why not, when they said");
      for (const row of reasons) {
        console.log(`    ${String(row["n"]).padStart(3)}  ${String(row["feedback_reason"])}`);
      }
    }

    // A rated-wrong answer is a golden-set candidate: the answer is on the row.
    const rejected = await one(
      `select question, answer, plan_context, route, feedback_reason
         from feedback_report
        where asked_at > now() - $1::interval
          and member_feedback = 'not_resolved'
        order by feedback_at desc limit 10`,
    );
    console.log("\n  Answers a member rated wrong (candidates for the golden set)");
    if (rejected.length === 0) console.log("    none");
    for (const row of rejected) {
      const why = row["feedback_reason"] === null ? "no reason given" : String(row["feedback_reason"]);
      console.log(`    ${String(row["plan_context"])} [${String(row["route"])}] ${why}`);
      console.log(`      Q: ${String(row["question"]).slice(0, 84)}`);
      const answer = row["answer"] === null ? "(not stored: a signed-in turn)" : String(row["answer"]);
      console.log(`      A: ${answer.replace(/\s+/g, " ").slice(0, 84)}`);
    }

    const callbacks = await one(
      "select count(*) n from callbacks where created_at > now() - $1::interval",
    );
    console.log(`\n  Callback requests    ${callbacks[0]?.["n"] ?? 0}\n`);
  } finally {
    await client.end();
  }
}

const [command, argument] = process.argv.slice(2);
if (command === "reproduce" && argument !== undefined) {
  await reproduce(argument);
} else if (command === "insights") {
  await insights(Number(argument ?? "7"));
} else {
  console.error('usage: ops reproduce <turn-id>  |  ops insights [days]');
  process.exit(1);
}
