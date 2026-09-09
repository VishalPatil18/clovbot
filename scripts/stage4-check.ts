/**
 * Stage 4 acceptance checks. Not a unit test: it needs the live index, and its
 * value is the measured numbers, which are printed rather than asserted.
 */
import { embed } from "../src/rag/providers.ts";
import { connectAdmin, searchHybrid, type RetrievalMode } from "../src/rag/store.ts";
import type { DocumentKind } from "../src/types.ts";

const SCOPE = { contractId: "H5141", planId: "004", planYear: 2026 };
const TOP_K = 5;

/** Drawn from the bucket A call drivers in docs/call-drivers.md. */
const SMOKE: { question: string; expect: DocumentKind }[] = [
  { question: "what is the specialist copay", expect: "summary_of_benefits" },
  { question: "how much does an ambulance ride cost", expect: "summary_of_benefits" },
  { question: "what tier is atorvastatin on", expect: "formulary" },
  { question: "how do I file an appeal", expect: "evidence_of_coverage" },
  { question: "what is changing about my plan next year", expect: "annual_notice_of_change" },
  { question: "do I need a referral to see a specialist", expect: "evidence_of_coverage" },
  { question: "what is my maximum out of pocket for the year", expect: "summary_of_benefits" },
  { question: "is routine dental care covered", expect: "summary_of_benefits" },
  { question: "what does prior authorization mean", expect: "evidence_of_coverage" },
  { question: "what do I pay for an emergency room visit", expect: "summary_of_benefits" },
];

async function rank(
  client: Awaited<ReturnType<typeof connectAdmin>>,
  question: string,
  mode: RetrievalMode,
  limit = TOP_K,
): Promise<{ id: string; kind: string; section: string; content: string }[]> {
  const [vector] = await embed([question]);
  if (vector === undefined) throw new Error("no embedding");
  const rows = await searchHybrid(client, vector, question, SCOPE, limit, mode);
  return rows.map((row) => ({
    id: row.id,
    kind: row.documentId,
    section: row.section,
    content: row.content,
  }));
}

const client = connectAdmin();
await client.connect();

try {
  console.log("=== Smoke set: correct source document in top 5 ===");
  let hits = 0;
  for (const { question, expect } of SMOKE) {
    const results = await rank(client, question, "hybrid");
    const hit = results.some((r) => r.kind.includes(expect));
    if (hit) hits += 1;
    console.log(`  ${hit ? "hit " : "MISS"} ${question}`);
    if (!hit) console.log(`        wanted ${expect}, got ${[...new Set(results.map((r) => r.kind))].join(", ")}`);
  }
  console.log(`  ${hits}/${SMOKE.length} retrieved the expected source document\n`);

  console.log("=== D-004: hybrid vs single-mode baselines ===");
  const cases = [
    // A common drug the embedding model already knows: dense alone is enough.
    { label: "exact token, common drug", question: "atorvastatin", want: "formulary", needle: "ATORVASTATIN" },
    // A rare brand name carries little semantic signal, so dense drops it out of
    // the top 5 and only the lexical half finds it. This is why D-004 exists.
    { label: "exact token, rare brand", question: "ORSERDU", want: "formulary", needle: "ORSERDU" },
    { label: "paraphrase (no shared words)", question: "what does it cost to see a skin doctor", want: "summary_of_benefits", needle: "copay" },
  ];

  for (const { label, question, want, needle } of cases) {
    // Rank of the chunk that actually contains the answer, not merely the first
    // chunk from the right document, which every mode would satisfy trivially.
    const rankOf = (rows: { kind: string; content: string }[]): number =>
      rows.findIndex(
        (r) => r.kind.includes(want) && r.content.toUpperCase().includes(needle.toUpperCase()),
      );
    const dense = await rank(client, question, "dense", 20);
    const lexical = await rank(client, question, "lexical", 20);
    const hybrid = await rank(client, question, "hybrid", 20);
    const fmt = (n: number): string => (n === -1 ? "absent" : `rank ${n + 1}`);
    console.log(`  ${label}: "${question}" -> ${want}`);
    console.log(`    dense=${fmt(rankOf(dense))}  lexical=${fmt(rankOf(lexical))}  hybrid=${fmt(rankOf(hybrid))}`);
  }
} finally {
  await client.end();
}
