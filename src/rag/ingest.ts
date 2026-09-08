import { existsSync, readFileSync } from "node:fs";
import { markdownPath } from "../corpus/snapshot.ts";
import type { DocumentKind, Snapshot } from "../corpus/types.ts";
import { chunkDocument, type CorpusChunk } from "./chunk.ts";
import { ALL_PLANS, isAllowedPlanYear } from "./provenance.ts";

/** D-007 defers structured lookup to P2; as prose these are noise that swamps lexical search. */
export const EXCLUDED_KINDS: DocumentKind[] = ["pharmacy_directory"];

/** Documents covering the whole contract rather than one plan benefit package. */
const CONTRACT_WIDE: DocumentKind[] = ["formulary", "corporate"];

export interface RejectedDocument {
  documentId: string;
  reason: string;
}

export interface PlannedIngest {
  chunks: CorpusChunk[];
  rejected: RejectedDocument[];
}

/**
 * Decides what gets indexed, and rejects out-of-year documents at ingest rather
 * than filtering them at query time. FR-01.
 */
export function planIngest(
  snapshot: Snapshot,
  configuredPlanYear: number,
  readMarkdown: (documentId: string) => string | null,
): PlannedIngest {
  const chunks: CorpusChunk[] = [];
  const rejected: RejectedDocument[] = [];

  for (const entry of snapshot.entries) {
    if (entry.status !== "ok" && entry.status !== "synthetic") {
      rejected.push({ documentId: entry.documentId, reason: `status ${entry.status}` });
      continue;
    }
    if (EXCLUDED_KINDS.includes(entry.kind)) {
      rejected.push({ documentId: entry.documentId, reason: `${entry.kind} excluded, deferred to P2 per D-007` });
      continue;
    }

    const planYear = documentPlanYear(entry.documentId, snapshot.planYear);
    if (!isAllowedPlanYear(planYear, configuredPlanYear)) {
      rejected.push({
        documentId: entry.documentId,
        reason: `plan year ${String(planYear)} is not ${configuredPlanYear}`,
      });
      continue;
    }

    const text = readMarkdown(entry.documentId);
    if (text === null || text.trim().length === 0) {
      rejected.push({ documentId: entry.documentId, reason: "no converted markdown" });
      continue;
    }

    chunks.push(
      ...chunkDocument({
        text,
        kind: entry.kind,
        documentId: entry.documentId,
        contractId: entry.contractId,
        planId: CONTRACT_WIDE.includes(entry.kind) ? ALL_PLANS : entry.planId,
        planYear,
        snapshotId: snapshot.id,
      }),
    );
  }
  return { chunks, rejected };
}

/** Document ids carry their plan year, so a stale document is caught by its own name. */
function documentPlanYear(documentId: string, fallback: number): number {
  const year = /-(\d{4})-/.exec(documentId)?.[1];
  return year === undefined ? fallback : Number(year);
}

export function readSnapshotMarkdown(snapshotId: string): (documentId: string) => string | null {
  return (documentId) => {
    const path = markdownPath(snapshotId, documentId);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  };
}
