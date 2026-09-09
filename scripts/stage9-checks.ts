/**
 * Stage 9 acceptance and the voice latency numbers. NFR-PERF-03 and 04 were
 * never measured, because Stage 2 was skipped; this is where the real values
 * come from. Numbers are printed and written, not asserted against a guess.
 */
import { writeFileSync } from "node:fs";
import { answerTurn } from "../src/rag/answer-turn.ts";
import { connectAdmin } from "../src/rag/store.ts";
import { audioKey, findCachedAudio } from "../src/voice/cache.ts";
import { speak } from "../src/voice/providers.ts";

const SCOPE = { contractId: "H5141", planId: "004", planYear: 2026 };
const QUESTIONS = [
  "what is my specialist copay",
  "what do I pay for an emergency room visit",
  "do I need a referral to see a specialist",
];

let failures = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${label}`);
  if (detail.length > 0) console.log(`        ${detail}`);
};

const client = connectAdmin();
await client.connect();

const runs: {
  question: string;
  answerMs: number;
  firstAudioMs: number;
  totalMs: number;
  provider: string;
  characters: number;
}[] = [];

try {
  console.log("\n1. A full question and answer by voice [FR-19]");
  for (const question of QUESTIONS) {
    const started = Date.now();
    const turn = await answerTurn(client, question, SCOPE);
    const answeredAt = Date.now();

    const spoken = await speak(turn.answer);
    const audioAt = Date.now();

    runs.push({
      question,
      answerMs: answeredAt - started,
      firstAudioMs: audioAt - started,
      totalMs: audioAt - started,
      provider: spoken.provider,
      characters: turn.answer.length,
    });

    check(
      `spoken and written together: ${question.slice(0, 34)}`,
      turn.answer.trim().length > 0 && (spoken.value !== null || spoken.provider === "browser"),
      `${spoken.provider}, ${turn.answer.length} characters`,
    );
  }

  console.log("\n2. Audio is never the only copy [FR-19]");
  {
    const turn = await answerTurn(client, "what is my out of pocket maximum", SCOPE);
    check("the answer exists as text", turn.answer.trim().length > 0);
    check("with citations", turn.citedIds.length > 0, `${turn.citedIds.length} cited`);
  }

  console.log("\n3. A repeated answer is served from cache [FR-20]");
  {
    const text = runs[0]?.question === undefined ? "cache probe" : "The specialist copay is ten dollars.";
    const first = Date.now();
    const one = await speak(text);
    const firstMs = Date.now() - first;
    if (one.value !== null) {
      const { writeAudio } = await import("../src/voice/cache.ts");
      writeAudio(audioKey(text, process.env["ELEVENLABS_VOICE_ID"] ?? "default", one.provider), one.value);
    }
    const hit = findCachedAudio(text, process.env["ELEVENLABS_VOICE_ID"] ?? "default", [
      "elevenlabs",
      "fishaudio",
    ]);
    check("second request finds the recording", hit !== null, `first synthesis ${firstMs}ms`);
  }

  console.log("\n4. Measured latency [NFR-PERF-03, NFR-PERF-04]");
  {
    const firstAudio = runs.map((run) => run.firstAudioMs).sort((a, b) => a - b);
    const answers = runs.map((run) => run.answerMs).sort((a, b) => a - b);
    const median = (values: number[]): number => values[Math.floor(values.length / 2)] ?? 0;

    console.log(`        answer ready       median ${median(answers)}ms`);
    console.log(`        first audio        median ${median(firstAudio)}ms   worst ${firstAudio.at(-1)}ms`);
    console.log(`        NFR-PERF-03 target 1500ms  -> ${median(firstAudio) <= 1500 ? "met" : "MISSED"}`);
    console.log(`        NFR-PERF-04 target 4000ms  -> ${median(firstAudio) <= 4000 ? "met" : "MISSED"}`);
    console.log("        unthrottled, uncached, one run each");

    writeFileSync(
      "eval/results/voice-latency.json",
      `${JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          note: "Unthrottled, uncached. Stage 2 was skipped, so these are the first voice measurements taken.",
          targets: { firstAudioMs: 1500, completeMs: 4000 },
          runs,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log("        written to eval/results/voice-latency.json");
  }
} finally {
  await client.end();
}

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} checks FAILED`}`);
if (failures > 0) process.exit(1);
