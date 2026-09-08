import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotDir, writeJson } from "../corpus/snapshot.ts";
import type { CorpusChunk } from "./chunk.ts";
import { generate } from "./providers.ts";

const storePath = (snapshotId: string): string =>
  join(snapshotDir(snapshotId), "context-prefixes.json");

/**
 * Generated prefixes are frozen to disk. The model is not deterministic, so
 * regenerating each run would make ingest report unchanged chunks as changed
 * and re-embed them forever. docs/testing-strategy.md section 4.
 */
export function readGeneratedContext(snapshotId: string): Record<string, string> {
  const path = storePath(snapshotId);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
}

export function writeGeneratedContext(
  snapshotId: string,
  prefixes: Record<string, string>,
): void {
  writeJson(storePath(snapshotId), prefixes);
}

const SYSTEM =
  "You label excerpts from Medicare plan documents so they can be found by search. " +
  "Given an excerpt, reply with one short sentence naming the benefit, service or topic it covers. " +
  "State only what the excerpt shows. Never invent a benefit name, an amount or a plan detail. " +
  "Reply with the sentence alone, no preamble.";

/**
 * D-006, for the minority of chunks with no heading to inherit context from.
 * Headings cover the rest deterministically, which keeps this off the hot path
 * and off the bill for ~95% of the corpus.
 */
export async function describeChunk(chunk: CorpusChunk): Promise<string> {
  const scope = `${chunk.contractId}-${chunk.planId}, plan year ${chunk.planYear}`;
  try {
    const { text } = await generate({
      system: SYSTEM,
      user: `Document: ${chunk.kind}. Plan: ${scope}.\n\nExcerpt:\n${chunk.content.slice(0, 1_200)}`,
    });
    return `${chunk.contextPrefix} ${text.trim().replace(/\s+/g, " ")}`;
  } catch {
    // A failed label must not block ingest, and must not silently look like a real one.
    return `${chunk.contextPrefix} Context could not be generated.`;
  }
}
