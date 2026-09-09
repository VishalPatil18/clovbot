/**
 * Asserts FR-P2-03 against the live index: retrieval scoped to one plan never
 * returns another plan's rows. Exits non-zero on the first leak.
 *
 * This is the assertion that matters, because leakage does not surface as an
 * error. It surfaces as a confidently wrong copay.
 */
import { CORPUS_SCOPE, formatPlanRef } from "../src/corpus/scope.ts";
import { isInPlanScope } from "../src/rag/provenance.ts";
import { embed } from "../src/rag/providers.ts";
import { connectAdmin, searchHybrid } from "../src/rag/store.ts";

const QUESTIONS = [
  "what is my specialist copay",
  "what is my out of pocket maximum",
  "how much is an emergency room visit",
  "what does urgent care cost",
  "is dental covered",
  "what tier is atorvastatin on",
  "how do I file an appeal",
  "what is the primary care copay",
  "can I see a doctor out of network",
  "what is my ambulance copay",
] as const;

const TOP_K = 10;

const client = connectAdmin();
await client.connect();

let leaks = 0;
let checked = 0;

try {
  for (const scope of CORPUS_SCOPE.plans) {
    for (const question of QUESTIONS) {
      const [vector] = await embed([question]);
      if (vector === undefined) throw new Error(`no embedding for "${question}"`);
      const rows = await searchHybrid(client, vector, question, scope, TOP_K);
      for (const row of rows) {
        checked += 1;
        if (isInPlanScope(scope, row)) continue;
        leaks += 1;
        console.error(
          `LEAK under ${formatPlanRef(scope)} asking "${question}": ` +
            `${row.id} is ${row.contractId}-${row.planId} plan year ${row.planYear}`,
        );
      }
    }
    console.log(`${formatPlanRef(scope)}: ${QUESTIONS.length} questions clean`);
  }
} finally {
  await client.end();
}

console.log(`\n${checked} rows checked across ${CORPUS_SCOPE.plans.length} plans, ${leaks} leaks.`);
if (leaks > 0) process.exit(1);
