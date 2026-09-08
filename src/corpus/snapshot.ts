import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ManifestEntry, Snapshot, SourceDocument } from "./types.ts";

export const DATA_ROOT = "data/snapshots";

export const snapshotDir = (id: string): string => join(DATA_ROOT, id);
export const rawPath = (id: string, documentId: string, ext: string): string =>
  join(snapshotDir(id), "raw", `${documentId}.${ext}`);
export const markdownPath = (id: string, documentId: string): string =>
  join(snapshotDir(id), "markdown", `${documentId}.md`);

/** Word coordinates, kept for documents whose tables need typed extraction. D-058. */
export const bboxPath = (id: string, documentId: string): string =>
  join(snapshotDir(id), "bbox", `${documentId}.xhtml`);

/** Sortable and filename-safe: 2026-09-07T2231Z. */
export function newSnapshotId(now: Date): string {
  return `${now.toISOString().slice(0, 16).replace(/:/g, "")}Z`;
}

/**
 * At query time only the id is needed: chunks come from Postgres. A deployed
 * host has no snapshot directory, so the id is configurable and the directory
 * listing is the local fallback.
 */
export function latestSnapshotId(): string {
  const configured = process.env["CORPUS_SNAPSHOT_ID"];
  if (configured !== undefined && configured.length > 0) return configured;

  if (!existsSync(DATA_ROOT)) {
    throw new Error(`no snapshots under ${DATA_ROOT}. Run "npm run corpus:discover" first.`);
  }
  const ids = readdirSync(DATA_ROOT).filter((name) => !name.startsWith(".")).sort();
  const latest = ids.at(-1);
  if (latest === undefined) {
    throw new Error(`no snapshots under ${DATA_ROOT}. Run "npm run corpus:discover" first.`);
  }
  return latest;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeFile(path: string, body: string | Uint8Array): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

export function readJson(path: string): unknown {
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

export const catalogPath = (id: string): string => join(snapshotDir(id), "catalog.json");
export const documentsPath = (id: string): string => join(snapshotDir(id), "documents.json");
export const manifestPath = (id: string): string => join(snapshotDir(id), "manifest.json");

export function readDocuments(id: string): SourceDocument[] {
  const raw = readJson(documentsPath(id));
  if (!Array.isArray(raw)) throw new Error(`${documentsPath(id)}: expected an array`);
  return raw as SourceDocument[];
}

export function readSnapshot(id: string): Snapshot {
  const raw = readJson(manifestPath(id));
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${manifestPath(id)}: expected an object`);
  }
  const snapshot = raw as Snapshot;
  if (!Array.isArray(snapshot.entries)) {
    throw new Error(`${manifestPath(id)}: expected an "entries" array`);
  }
  return snapshot;
}

export function writeManifest(snapshot: Snapshot): void {
  writeJson(manifestPath(snapshot.id), snapshot);
}

export function mergeEntries(
  existing: ManifestEntry[],
  updates: ManifestEntry[],
): ManifestEntry[] {
  const byId = new Map(existing.map((entry) => [entry.documentId, entry]));
  for (const update of updates) byId.set(update.documentId, update);
  return [...byId.values()];
}
