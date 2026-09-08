import { readFileSync } from "node:fs";
import pg from "pg";
import type { CorpusChunk } from "./chunk.ts";
import type { PromptChunk } from "./prompt.ts";

export interface RetrievedChunk extends PromptChunk {
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

/** Replaces the snapshot's rows, so re-running ingest does not duplicate chunks. */
export async function replaceChunks(
  client: pg.Client,
  snapshotId: string,
  chunks: CorpusChunk[],
  embeddings: number[][],
): Promise<void> {
  await client.query("begin");
  try {
    await client.query("delete from chunks where snapshot_id = $1", [snapshotId]);
    for (const [index, chunk] of chunks.entries()) {
      const vector = embeddings[index];
      if (vector === undefined) throw new Error(`no embedding for chunk ${chunk.id}`);
      await client.query(
        `insert into chunks
           (id, snapshot_id, document_id, kind, contract_id, plan_id, plan_year, section, content, embedding)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          chunk.id,
          chunk.snapshotId,
          chunk.documentId,
          chunk.kind,
          chunk.contractId,
          chunk.planId,
          chunk.planYear,
          chunk.section,
          chunk.content,
          toVector(vector),
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/**
 * Plan is filtered in SQL, before ranking. Two plans share near-identical prose
 * with different amounts, so ranking first and filtering after would let the
 * wrong plan's copay win on similarity. D-033.
 */
export async function searchByVector(
  client: pg.Client,
  embedding: number[],
  scope: { contractId: string; planId: string; planYear: number },
  limit: number,
): Promise<RetrievedChunk[]> {
  const { rows } = await client.query(
    `select id, document_id, contract_id, plan_id, plan_year, section, content,
            embedding <=> $1 as distance
       from chunks
      where contract_id = $2 and plan_id = $3 and plan_year = $4
      order by embedding <=> $1
      limit $5`,
    [toVector(embedding), scope.contractId, scope.planId, scope.planYear, limit],
  );

  return rows.map((row: Record<string, unknown>) => ({
    id: String(row["id"]),
    documentId: String(row["document_id"]),
    contractId: String(row["contract_id"]),
    planId: String(row["plan_id"]),
    planYear: Number(row["plan_year"]),
    section: String(row["section"]),
    content: String(row["content"]),
    distance: Number(row["distance"]),
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
}

/** FR-26. The question written here is already redacted per FR-31. */
export async function writeTurn(client: pg.Client, turn: TurnRecord): Promise<string> {
  const { rows } = await client.query(
    `insert into turns
       (question, plan_context, chunk_ids, corpus_snapshot_id, outcome, provider, latency_ms)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id`,
    [
      turn.question,
      turn.planContext,
      turn.chunkIds,
      turn.corpusSnapshotId,
      turn.outcome,
      turn.provider,
      JSON.stringify(turn.latencyMs),
    ],
  );
  return String(rows[0]?.["id"]);
}
