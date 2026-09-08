import { readFileSync } from "node:fs";
import pg from "pg";
import type { CorpusChunk } from "./chunk.ts";
import type { DocumentKind } from "../corpus/types.ts";
import type { PromptChunk } from "./prompt.ts";

export interface RetrievedChunk extends PromptChunk {
  /** Needed for citation rendering and EOC precedence. FR-06, FR-07. */
  kind: DocumentKind;
  distance: number;
}

/** Supabase serves a self-signed chain, so pin their CA rather than skip verification. */
const CA_PATH = "certs/supabase-ca.crt";

export function connect(): pg.Client {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error("missing DATABASE_URL. Copy .env.example to .env and fill it in.");
  }
  return new pg.Client({
    connectionString,
    ssl: { ca: readFileSync(CA_PATH, "utf8"), rejectUnauthorized: true },
  });
}

const toVector = (values: number[]): string => `[${values.join(",")}]`;

/** What the snapshot already holds, so unchanged chunks are never re-embedded. */
export async function existingChunkContent(
  client: pg.Client,
  snapshotId: string,
): Promise<Map<string, string>> {
  const { rows } = await client.query(
    "select id, context_prefix || chr(10) || content as body from chunks where snapshot_id = $1",
    [snapshotId],
  );
  return new Map(rows.map((row: Record<string, unknown>) => [String(row["id"]), String(row["body"])]));
}

/**
 * Upserts the snapshot's chunks and deletes any that no longer exist, so a second
 * run over unchanged sources changes nothing and duplicates nothing. NFR-OPS-01.
 */
export async function upsertChunks(
  client: pg.Client,
  chunks: CorpusChunk[],
  embeddings: Map<string, number[]>,
): Promise<void> {
  await client.query("begin");
  try {
    for (const chunk of chunks) {
      const vector = embeddings.get(chunk.id);
      if (vector === undefined) continue;
      await client.query(
        `insert into chunks
           (id, snapshot_id, document_id, kind, contract_id, plan_id, plan_year,
            section, content, context_prefix, embedding)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (id) do update set
           snapshot_id = excluded.snapshot_id, document_id = excluded.document_id,
           kind = excluded.kind, contract_id = excluded.contract_id,
           plan_id = excluded.plan_id, plan_year = excluded.plan_year,
           section = excluded.section, content = excluded.content,
           context_prefix = excluded.context_prefix, embedding = excluded.embedding`,
        [
          chunk.id, chunk.snapshotId, chunk.documentId, chunk.kind, chunk.contractId,
          chunk.planId, chunk.planYear, chunk.section, chunk.content,
          chunk.contextPrefix, toVector(vector),
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/** Removes chunks the current plan no longer produces. Runs once, after every upsert. */
export async function pruneChunks(
  client: pg.Client,
  snapshotId: string,
  keepIds: string[],
): Promise<number> {
  const { rowCount } = await client.query(
    "delete from chunks where snapshot_id = $1 and not (id = any($2::text[]))",
    [snapshotId, keepIds],
  );
  return rowCount ?? 0;
}

export type RetrievalMode = "hybrid" | "dense" | "lexical";

/**
 * Plan is filtered in SQL, before ranking, inside search_hybrid. Two plans share
 * near-identical prose with different amounts, so ranking first and filtering
 * after would let the wrong plan's copay win on similarity. D-033.
 */
export async function searchHybrid(
  client: pg.Client,
  embedding: number[],
  queryText: string,
  scope: { contractId: string; planId: string; planYear: number },
  limit: number,
  mode: RetrievalMode = "hybrid",
): Promise<RetrievedChunk[]> {
  const { rows } = await client.query(
    "select * from search_hybrid($1,$2,$3,$4,$5,$6,60,$7)",
    [
      toVector(embedding), queryText, scope.contractId, scope.planId,
      scope.planYear, limit, mode,
    ],
  );

  return rows.map((row: Record<string, unknown>) => ({
    id: String(row["id"]),
    documentId: String(row["document_id"]),
    kind: String(row["kind"]) as DocumentKind,
    contractId: String(row["contract_id"]),
    planId: String(row["plan_id"]),
    planYear: Number(row["plan_year"]),
    section: String(row["section"]),
    content: String(row["content"]),
    distance: 1 - Number(row["score"]),
  }));
}

export interface TurnRecord {
  question: string;
  planContext: string;
  chunkIds: string[];
  corpusSnapshotId: string;
  outcome: "answered" | "refused" | "upstream_failure";
  provider: string;
  latencyMs: Record<string, number>;
  sessionId?: string;
  refusalTrigger?: string | null;
}

/** FR-26. The question written here is already redacted per FR-31. */
export async function writeTurn(client: pg.Client, turn: TurnRecord): Promise<string> {
  const { rows } = await client.query(
    `insert into turns
       (question, plan_context, chunk_ids, corpus_snapshot_id, outcome, provider,
        latency_ms, session_id, refusal_trigger)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      turn.question,
      turn.planContext,
      turn.chunkIds,
      turn.corpusSnapshotId,
      turn.outcome,
      turn.provider,
      JSON.stringify(turn.latencyMs),
      turn.sessionId ?? null,
      turn.refusalTrigger ?? null,
    ],
  );
  return String(rows[0]?.["id"]);
}

/** FR-27. Recorded against the turn it answers. */
export async function recordFeedback(
  client: pg.Client,
  turnId: string,
  resolved: boolean,
): Promise<boolean> {
  const { rowCount } = await client.query(
    "update turns set member_feedback = $2 where id = $1",
    [turnId, resolved ? "resolved" : "not_resolved"],
  );
  return (rowCount ?? 0) > 0;
}

export interface RetrievedTurn {
  id: string;
  question: string;
  chunkIds: string[];
  corpusSnapshotId: string;
  outcome: string;
  planContext: string | null;
}

/** NFR-OPS-02. Every answer is reproducible from its logged chunk ids. */
export async function readTurn(client: pg.Client, turnId: string): Promise<RetrievedTurn | null> {
  const { rows } = await client.query(
    `select id, question, chunk_ids, corpus_snapshot_id, outcome, plan_context
       from turns where id = $1`,
    [turnId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: String(row["id"]),
    question: String(row["question"]),
    chunkIds: (row["chunk_ids"] as string[]) ?? [],
    corpusSnapshotId: String(row["corpus_snapshot_id"]),
    outcome: String(row["outcome"]),
    planContext: row["plan_context"] === null ? null : String(row["plan_context"]),
  };
}

/** The chunks exactly as they were retrieved, by id and snapshot. NFR-OPS-02. */
export async function readChunksByIds(
  client: pg.Client,
  chunkIds: string[],
  snapshotId: string,
): Promise<{ id: string; documentId: string; section: string; content: string }[]> {
  const { rows } = await client.query(
    `select id, document_id, section, content
       from chunks where id = any($1::text[]) and snapshot_id = $2`,
    [chunkIds, snapshotId],
  );
  const byId = new Map(
    rows.map((row: Record<string, unknown>) => [
      String(row["id"]),
      {
        id: String(row["id"]),
        documentId: String(row["document_id"]),
        section: String(row["section"]),
        content: String(row["content"]),
      },
    ]),
  );
  // Returned in the order they were retrieved, not the order Postgres found them.
  return chunkIds.map((id) => byId.get(id)).filter((chunk) => chunk !== undefined);
}

/**
 * Consecutive refusals for a session, newest first. Read from the turn log so
 * the loop breaker survives a restart rather than living in server memory. FR-23.
 */
export async function consecutiveRefusals(
  client: pg.Client,
  sessionId: string,
): Promise<number> {
  const { rows } = await client.query(
    "select outcome from turns where session_id = $1 order by asked_at desc limit 10",
    [sessionId],
  );
  let count = 0;
  for (const row of rows) {
    if (String(row["outcome"]) === "answered") break;
    if (String(row["outcome"]) === "refused") count += 1;
  }
  return count;
}

export interface RateVerdict {
  allowed: boolean;
  used: number;
  remaining: number;
}

/** FR-30, NFR-SEC-02. */
export async function checkRate(
  client: pg.Client,
  key: string,
  limit: number,
  window: string,
): Promise<RateVerdict> {
  const { rows } = await client.query("select * from rate_check($1,$2,$3::interval)", [
    key,
    limit,
    window,
  ]);
  const row = rows[0] ?? {};
  return {
    allowed: row["allowed"] === true,
    used: Number(row["used"] ?? 0),
    remaining: Number(row["remaining"] ?? 0),
  };
}

export interface CallbackRequest {
  question: string;
  planContext: string | null;
  documentsSearched: string[];
  refusalTrigger: string | null;
  note: string | null;
  sessionId: string;
}

/** Validates, stores and confirms. Nothing is sent anywhere. D-026. */
export async function writeCallback(
  client: pg.Client,
  request: CallbackRequest,
): Promise<string> {
  const { rows } = await client.query(
    `insert into callbacks
       (question, plan_context, documents_searched, refusal_trigger, note, session_id)
     values ($1,$2,$3,$4,$5,$6)
     returning id`,
    [
      request.question,
      request.planContext,
      request.documentsSearched,
      request.refusalTrigger,
      request.note,
      request.sessionId,
    ],
  );
  return String(rows[0]?.["id"]);
}
