/**
 * Asserts against the live seed that one member's record never contains
 * another's. Exits non-zero on the first leak.
 */
import { SEED_MEMBERS } from "../src/members/seed.ts";
import { loadMemberRecord } from "../src/members/store.ts";
import { connectAdmin } from "../src/rag/store.ts";
import type { MemberTopic } from "../src/auth/login-required.ts";

/** Every topic, so the check still covers the whole record after. */
const TOPICS: readonly MemberTopic[] = [
  "claim",
  "prior_authorization",
  "balance",
  "appointment",
  "provider",
];

const client = connectAdmin();
await client.connect();

let leaks = 0;
try {
  for (const member of SEED_MEMBERS) {
    const records = [];
    for (const topic of TOPICS) {
      const record = await loadMemberRecord(client, member.id, topic);
      if (record === null) throw new Error(`member ${String(member.id)} is not seeded`);
      records.push(record);
    }
    const body = JSON.stringify(records);

    const foreign = SEED_MEMBERS.filter((other) => other.id !== member.id).flatMap((other) => [
      ...other.claims.map((c) => c.id),
      ...other.priorAuthorizations.map((p) => p.id),
      ...other.appointments.map((a) => a.id),
      other.email,
      other.displayName,
    ]);

    for (const marker of foreign) {
      if (!body.includes(marker)) continue;
      leaks += 1;
      console.error(`LEAK: member ${String(member.id)}'s record contains "${marker}"`);
    }
    console.log(`member ${String(member.id)}: ${String(records.reduce((n, r) => n + r.facts.length, 0))} facts, no foreign data`);
  }
} finally {
  await client.end();
}

console.log(`\n${String(SEED_MEMBERS.length)} records checked, ${String(leaks)} leaks.`);
if (leaks > 0) process.exit(1);
