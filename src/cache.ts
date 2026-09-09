import { createHash } from "node:crypto";
import type pg from "pg";
import type { PlanRef } from "./types.ts";
import type { Speech } from "./i18n.ts";

/**
 * Three caches over one store. Emptying all three changes no answer, only the
 * time taken to produce one, and that property is asserted by test.
 */

const sha = (value: string): string => createHash("sha256").update(value).digest("hex");

/**
 * Case, spacing and trailing punctuation only. "in-network" and "out-of-network"
 * differ by one word and ten dollars, so reaching further is the collision itself.
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

/** Voice and provider stay in the key: the same words elsewhere are another recording. */
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
 * Clears one snapshot's answers. For re-ingesting into the same id, where chunks
 * change and keys do not. Embeddings and audio cannot go stale, so they stay.
 */
export async function clearAnswers(client: pg.Client, snapshotId: string): Promise<number> {
  const { rowCount } = await client.query("delete from answer_cache where snapshot_id = $1", [
    snapshotId,
  ]);
  return rowCount ?? 0;
}
