import { createHash } from "node:crypto";
import type pg from "pg";
import type { PlanRef } from "./types.ts";
import type { Speech } from "./i18n.ts";

/**
 * Three caches over one store. FR-P3-53 to FR-P3-60.
 *
 * Every one of them is a pure optimisation: emptying all three changes no
 * answer, only the time it takes to produce one. That property is what makes
 * them safe in a product whose whole claim is that an answer is grounded in a
 * document, and it is asserted by test rather than assumed.
 */

const sha = (value: string): string => createHash("sha256").update(value).digest("hex");

/**
 * Case, spacing and trailing punctuation do not change an answer, so they do not
 * change a key. Nothing beyond that: "in-network" and "out-of-network" differ by
 * one word and by ten dollars, and a normaliser that reached further would be
 * the collision this design exists to avoid. D-100.
 */
export const normaliseQuestion = (question: string): string =>
  // Trim before stripping punctuation: with a trailing space the end anchor
  // does not match, and "copay??  " keys differently from "copay".
  question.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!,;:]+$/g, "").trim();

export function answerKey(
  question: string,
  scope: PlanRef,
  language: Speech,
  snapshotId: string,
): string {
  return sha(
    [
      snapshotId,
      scope.contractId,
      scope.planId,
      String(scope.planYear),
      language,
      normaliseQuestion(question),
    ].join(" "),
  );
}

export async function readAnswer(
  client: pg.Client,
  key: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await client.query(
    "update answer_cache set hits = hits + 1, last_hit_at = now() where key = $1 returning turn",
    [key],
  );
  const row = rows[0] as { turn: Record<string, unknown> } | undefined;
  return row === undefined ? null : row.turn;
}

export async function writeAnswer(
  client: pg.Client,
  entry: {
    key: string;
    snapshotId: string;
    scope: PlanRef;
    language: Speech;
    question: string;
    turn: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into answer_cache
       (key, snapshot_id, contract_id, plan_id, plan_year, language, question, turn)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (key) do nothing`,
    [
      entry.key,
      entry.snapshotId,
      entry.scope.contractId,
      entry.scope.planId,
      entry.scope.planYear,
      entry.language,
      entry.question,
      JSON.stringify(entry.turn),
    ],
  );
}

const toVector = (values: number[]): string => `[${values.join(",")}]`;

/** Keyed on the text and the model: a different model is a different vector space. */
export const embeddingKey = (text: string, model: string): string => sha(`${model} ${text}`);

export async function readEmbedding(client: pg.Client, key: string): Promise<number[] | null> {
  const { rows } = await client.query(
    "update embedding_cache set hits = hits + 1, last_hit_at = now() where key = $1 returning embedding",
    [key],
  );
  const row = rows[0] as { embedding: string } | undefined;
  return row === undefined ? null : (JSON.parse(row.embedding) as number[]);
}

export async function writeEmbedding(
  client: pg.Client,
  key: string,
  model: string,
  embedding: number[],
): Promise<void> {
  await client.query(
    "insert into embedding_cache (key, model, embedding) values ($1,$2,$3) on conflict (key) do nothing",
    [key, model, toVector(embedding)],
  );
}

/**
 * The same words in a different voice are a different recording, and serving
 * yesterday's voice after the chain degraded would be a silent inconsistency,
 * so both stay in the key.
 */
export const audioKey = (text: string, voice: string, provider: string): string =>
  sha(`${provider} ${voice} ${text}`);

export async function readAudio(
  client: pg.Client,
  text: string,
  voice: string,
  providers: readonly string[],
): Promise<{ audio: Buffer; provider: string } | null> {
  // In chain order: checking only the primary would miss every recording made
  // while the chain was degraded, and would mislabel the one it did find.
  for (const provider of providers) {
    const { rows } = await client.query(
      "update audio_cache set hits = hits + 1, last_hit_at = now() where key = $1 returning audio",
      [audioKey(text, voice, provider)],
    );
    const row = rows[0] as { audio: Buffer } | undefined;
    if (row !== undefined) return { audio: row.audio, provider };
  }
  return null;
}

export async function writeAudio(
  client: pg.Client,
  text: string,
  voice: string,
  provider: string,
  audio: Uint8Array,
): Promise<void> {
  const bytes = Buffer.from(audio);
  await client.query(
    `insert into audio_cache (key, provider, voice, audio, bytes)
     values ($1,$2,$3,$4,$5) on conflict (key) do nothing`,
    [audioKey(text, voice, provider), provider, voice, bytes, bytes.length],
  );
}

/**
 * Clears the answers held against one corpus snapshot. FR-P3-62.
 *
 * Re-ingesting under a new snapshot id needs no help: the id is part of the key,
 * so an old entry cannot be hit. This exists for the case that does need help,
 * which is re-running ingest into the **same** snapshot after fixing a parser
 * or re-fetching a document. The chunks change, the key does not, and every
 * cached answer for that corpus is now a claim about text that no longer exists.
 *
 * Embeddings and audio are deliberately untouched. A question's vector does not
 * depend on the corpus, and audio is keyed on the answer text, so a changed
 * answer gets a new key rather than a wrong recording. Clearing either would
 * re-pay a provider bill to invalidate something that was never stale. D-101.
 */
export async function clearAnswers(client: pg.Client, snapshotId: string): Promise<number> {
  const { rowCount } = await client.query("delete from answer_cache where snapshot_id = $1", [
    snapshotId,
  ]);
  return rowCount ?? 0;
}
