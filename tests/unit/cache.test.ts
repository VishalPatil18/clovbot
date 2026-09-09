import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answerKey, embeddingKey, normaliseQuestion } from "../../src/cache.ts";
import type { PlanRef } from "../../src/types.ts";

const PPO: PlanRef = { contractId: "H5141", planId: "004", planYear: 2026 };
const VALUE: PlanRef = { contractId: "H5141", planId: "007", planYear: 2026 };
const SNAP = "2026-09-09T0517Z";

const turn = readFileSync("src/rag/answer-turn.ts", "utf8");
const up = readFileSync("migrations/015_caches.sql", "utf8");

describe("the answer key is exact, not approximate [FR-P3-54, D-100]", () => {
  it("ignores what does not change an answer", () => {
    const a = answerKey("What is my specialist copay?", PPO, "en", SNAP);
    for (const variant of [
      "what is my specialist copay",
      "  What  is my   specialist copay?  ",
      "WHAT IS MY SPECIALIST COPAY!",
    ]) {
      expect(answerKey(variant, PPO, "en", SNAP), variant).toBe(a);
    }
  });

  // One word apart and ten dollars apart: the key is the question, not its embedding.
  it("separates two questions that a similarity score would merge", () => {
    expect(answerKey("what is my specialist copay", PPO, "en", SNAP)).not.toBe(
      answerKey("what is my out-of-network specialist copay", PPO, "en", SNAP),
    );
  });

  it("separates the same question under a different plan", () => {
    expect(answerKey("what is my specialist copay", PPO, "en", SNAP)).not.toBe(
      answerKey("what is my specialist copay", VALUE, "en", SNAP),
    );
  });

  it("separates the same question in a different language", () => {
    expect(answerKey("what is my specialist copay", PPO, "en", SNAP)).not.toBe(
      answerKey("what is my specialist copay", PPO, "es", SNAP),
    );
  });

  // Re-indexing is the invalidation: a new snapshot cannot hit the old entries.
  it("separates the same question against a different corpus", () => {
    expect(answerKey("what is my specialist copay", PPO, "en", SNAP)).not.toBe(
      answerKey("what is my specialist copay", PPO, "en", "2026-01-01T0000Z"),
    );
  });

  it("normalises only case, spacing and trailing punctuation", () => {
    expect(normaliseQuestion("  What   IS my copay??  ")).toBe("what is my copay");
    // Not stopwords, not stems, not synonyms.
    expect(normaliseQuestion("what is my out-of-network copay")).toContain("out-of-network");
  });
});

describe("embeddings are keyed to their model [FR-P3-56]", () => {
  it("does not serve a vector from a different model", () => {
    expect(embeddingKey("copay", "text-embedding-3-small")).not.toBe(
      embeddingKey("copay", "text-embedding-3-large"),
    );
  });
});

describe("a member turn is never cached [FR-P3-55]", () => {
  // The only way one member's record could reach another, and a cached answer
  // would also make the access log claim a read that never happened.
  it("gates both the read and the write on there being no member", () => {
    expect(turn).toMatch(/const cacheable = options\.memberId === undefined;/);
    expect(turn).toMatch(/if \(cacheable\) \{\s*\n\s*const hit = await readAnswer/);
    expect(turn).toMatch(/if \(cacheable && answered\)/);
  });

  it("looks in the cache only after the guardrails and the login gate", () => {
    expect(turn.indexOf("checkGuardrails")).toBeLessThan(turn.indexOf("readAnswer"));
    expect(turn.indexOf("needsMemberData")).toBeLessThan(turn.indexOf("readAnswer"));
  });

  it("says in the turn log that the answer came from the cache", () => {
    expect(turn).toMatch(/provider: "cache"/);
  });

  // A failure must never be served twice, and a refusal costs no generation.
  it("caches only an answered turn", () => {
    expect(turn).toMatch(/if \(cacheable && answered\) \{/);
  });
});

describe("the caches cannot change an answer [NFR-P3-15]", () => {
  // Every write is best-effort. A cache that cannot be written is a slower
  // product, not a broken one.
  it("never lets a cache failure fail a turn", () => {
    const write = turn.slice(turn.indexOf("if (cacheable && answered)"));
    expect(write.slice(0, 500)).toMatch(/\.catch\(/);
    expect(turn).toMatch(/readAnswer\(client, key\)\.catch\(\(\) => null\)/);
    expect(turn).toMatch(/writeEmbedding\([^)]*\)\.catch\(\(\) => \{\}\)/);
  });

  it("holds no member data, so it needs no policy", () => {
    // A column, not the word in the comment explaining its absence.
    expect(up).not.toMatch(/member_id\s+(integer|text)/);
    expect(up).toMatch(/No table here holds member data/);
  });
});

describe("ingest clears what an ingest can make stale [FR-P3-62, D-101]", () => {
  const cli = readFileSync("src/rag/cli.ts", "utf8");
  const cache = readFileSync("src/cache.ts", "utf8");

  // Re-ingesting under a new snapshot needs no help: the id is in the key. The
  // case that does is re-running into the same snapshot after a parser fix.
  it("clears the answers held against the snapshot it just wrote", () => {
    expect(cache).toMatch(/delete from answer_cache where snapshot_id = \$1/);
    expect(cli).toMatch(/clearAnswers\(client, snapshotId\)/);
  });

  // A run that dies half way leaves a partial corpus, which is exactly when a
  // cached answer citing text that no longer exists is least expected.
  it("clears on a failed run too, not only a successful one", () => {
    const phase = cli.slice(cli.indexOf("let done = 0;"));
    expect(phase).toMatch(/\} finally \{[\s\S]{0,200}clearAnswers/);
  });

  // Clearing first would let a question asked mid-run repopulate the cache from
  // the corpus being replaced.
  it("clears after the chunks are written, not before", () => {
    const phase = cli.slice(cli.indexOf("let done = 0;"));
    expect(phase.indexOf("upsertChunks")).toBeLessThan(phase.indexOf("clearAnswers"));
    expect(phase.indexOf("pruneChunks")).toBeLessThan(phase.indexOf("clearAnswers"));
  });

  // Neither can go stale: a vector does not depend on the corpus, and a changed
  // answer gets a new audio key rather than a wrong recording.
  it("leaves embeddings and audio alone", () => {
    expect(cache).not.toMatch(/delete from embedding_cache/);
    expect(cache).not.toMatch(/delete from audio_cache/);
    expect(cli).not.toMatch(/clearEmbeddings|clearAudio/);
  });
});
