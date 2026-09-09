import { readFileSync } from "node:fs";
import pg from "pg";
import type { CorpusChunk } from "./chunk.ts";
import type { DocumentKind } from "../corpus/types.ts";
import type { CitableKind, PlanRef } from "../types.ts";
import type { PromptChunk } from "./prompt.ts";

export interface RetrievedChunk extends PromptChunk {
  /** Needed for citation rendering and EOC precedence. FR-06, FR-07. */
  kind: CitableKind;
  distance: number;
}

/** Supabase serves a self-signed chain, so pin their CA rather than skip verification. */
const CA_PATH = "certs/supabase-ca.crt";

function client(variable: string): pg.Client {
  const connectionString = process.env[variable];
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error(`missing ${variable}. Copy .env.example to .env and fill it in.`);
  }
  return new pg.Client({
    connectionString,
    ssl: { ca: readFileSync(CA_PATH, "utf8"), rejectUnauthorized: true },
  });
}

/**
 * The running product's connection. Cannot bypass row-level security and holds
 * no DDL privilege, so a code path that forgets to scope a member query is
 * refused by the database rather than answered. D-090.
 *
 * No fallback to the admin URL. A missing variable must stop the process, not
 * quietly reconnect as the role that can read every member.
 */
export const connect = (): pg.Client => client("DATABASE_APP_URL");

/** Migrations, ingest, seeding and the operator tools. Owns the schema. */
export const connectAdmin = (): pg.Client => client("DATABASE_URL");

const toVector = (values: number[]): string => `[${values.join(",")}]`;

/**
 * The plans the index can actually answer for. Offering a plan whose documents
 * are missing produces a refusal that reads as a model failure, so the picker is
 * derived from the rows rather than from a list someone remembered to update.
 * Wildcard rows answer under every plan and name none. D-055.
 */
export async function indexedPlans(client: pg.Client): Promise<PlanRef[]> {
  const { rows } = await client.query(
    "select distinct contract_id, plan_id, plan_year from chunks " +
      "where plan_id <> '*' and contract_id <> '*' order by contract_id, plan_id",
  );
  return rows.map((row: Record<string, unknown>) => ({
    contractId: String(row["contract_id"]),
    planId: String(row["plan_id"]),
    planYear: Number(row["plan_year"]),
  }));
}

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

export interface DrugLookup {
  normalizedName: string;
  name: string;
  category: string;
  tier: number;
  requirements: string;
  documentId: string;
  planYear: number;
}

/** Every indexed drug name, for the router's deterministic selection. D-061. */
export async function loadDrugIndex(client: pg.Client, snapshotId: string): Promise<Set<string>> {
  const { rows } = await client.query(
    "select distinct normalized_name from drugs where snapshot_id = $1",
    [snapshotId],
  );
  return new Set(rows.map((row: Record<string, unknown>) => String(row["normalized_name"])));
}

/** The rows behind a tier answer. Exact match, so no ranking and no floor. */
export async function lookupDrugs(
  client: pg.Client,
  snapshotId: string,
  names: string[],
): Promise<DrugLookup[]> {
  if (names.length === 0) return [];
  const { rows } = await client.query(
    "select normalized_name, name, category, tier, requirements, document_id, plan_year " +
      "from drugs where snapshot_id = $1 and normalized_name = any($2) order by name",
    [snapshotId, names],
  );
  return rows.map((row: Record<string, unknown>) => ({
    normalizedName: String(row["normalized_name"]),
    name: String(row["name"]),
    category: String(row["category"]),
    tier: Number(row["tier"]),
    requirements: String(row["requirements"]),
    documentId: String(row["document_id"]),
    planYear: Number(row["plan_year"]),
  }));
}

export async function upsertDrugs(
  client: pg.Client,
  snapshotId: string,
  rows: DrugLookup[],
): Promise<void> {
  await client.query("begin");
  try {
    await client.query("delete from drugs where snapshot_id = $1", [snapshotId]);
    for (const row of rows) {
      await client.query(
        "insert into drugs (snapshot_id, document_id, normalized_name, name, category, tier, requirements, plan_year) " +
          "values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing",
        [
          snapshotId, row.documentId, row.normalizedName, row.name,
          row.category, row.tier, row.requirements, row.planYear,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export interface CorpusFreshness {
  snapshotId: string;
  /** When Clover's documents were fetched. What a member is asking about. */
  documentsFetchedAt: string;
  /** When they were indexed. An operator concern. */
  ingestedAt: string;
  planYear: number;
}

export async function recordCorpusSnapshot(
  client: pg.Client,
  snapshot: { snapshotId: string; documentsFetchedAt: string; planYear: number },
): Promise<void> {
  await client.query(
    `insert into corpus_snapshots (snapshot_id, documents_fetched_at, plan_year)
     values ($1,$2,$3)
     on conflict (snapshot_id) do update
       set documents_fetched_at = excluded.documents_fetched_at,
           ingested_at = now(),
           plan_year = excluded.plan_year`,
    [snapshot.snapshotId, snapshot.documentsFetchedAt, snapshot.planYear],
  );
}

export async function readCorpusFreshness(
  client: pg.Client,
  snapshotId: string,
): Promise<CorpusFreshness | null> {
  const { rows } = await client.query(
    "select snapshot_id, documents_fetched_at, ingested_at, plan_year from corpus_snapshots where snapshot_id = $1",
    [snapshotId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) return null;
  return {
    snapshotId: String(row["snapshot_id"]),
    documentsFetchedAt: new Date(String(row["documents_fetched_at"])).toISOString(),
    ingestedAt: new Date(String(row["ingested_at"])).toISOString(),
    planYear: Number(row["plan_year"]),
  };
}

export interface TurnRecord {
  question: string;
  planContext: string;
  chunkIds: string[];
  corpusSnapshotId: string;
  outcome: "answered" | "refused" | "upstream_failure" | "needs_login";
  provider: string;
  latencyMs: Record<string, number>;
  sessionId?: string;
  refusalTrigger?: string | null;
  /** FR-P2-09. Which retrieval paths ran, and why. D-063. */
  route?: string | null;
  routeReason?: string | null;
}

/** FR-26. The question written here is already redacted per FR-31. */
export async function writeTurn(client: pg.Client, turn: TurnRecord): Promise<string> {
  const { rows } = await client.query(
    `insert into turns
       (question, plan_context, chunk_ids, corpus_snapshot_id, outcome, provider,
        latency_ms, session_id, refusal_trigger, route, route_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
      turn.route ?? null,
      turn.routeReason ?? null,
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
