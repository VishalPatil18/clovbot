import { createHash } from "node:crypto";
import type { ManifestEntry, SourceDocument } from "./types.ts";

export interface FetchOutcome {
  status: number;
  bytes: Uint8Array | null;
  reason: string | null;
}

export type Fetcher = (url: string) => Promise<FetchOutcome>;

export interface FetchOptions {
  fetcher: Fetcher;
  delayMs: number;
  now: () => string;
  sleep: (ms: number) => Promise<void>;
  robotsAllowed: boolean;
}

export interface FetchedDocument {
  entry: ManifestEntry;
  bytes: Uint8Array | null;
}

/**
 * Minimal robots.txt check covering the wildcard agent only, which is the agent
 * this fetcher identifies as. Rules for named agents do not apply to us.
 */
export function isPathAllowed(robotsTxt: string, path: string): boolean {
  let wildcard = false;
  const disallowed: string[] = [];

  for (const raw of robotsTxt.split("\n")) {
    const line = raw.split("#")[0]?.trim() ?? "";
    const [field, ...rest] = line.split(":");
    const key = field?.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      wildcard = value === "*";
      continue;
    }
    if (key === "disallow" && wildcard && value.length > 0) disallowed.push(value);
  }

  return !disallowed.some((prefix) => path.startsWith(prefix));
}

export async function fetchDocuments(
  documents: SourceDocument[],
  options: FetchOptions,
): Promise<FetchedDocument[]> {
  const results: FetchedDocument[] = [];

  for (const [index, document] of documents.entries()) {
    if (index > 0) await options.sleep(options.delayMs);
    results.push(await fetchOne(document, options));
  }
  return results;
}

async function fetchOne(
  document: SourceDocument,
  options: FetchOptions,
): Promise<FetchedDocument> {
  const base = {
    documentId: document.id,
    kind: document.kind,
    contractId: document.contractId,
    planId: document.planId,
    language: document.language,
    url: document.url,
    retrievedAt: options.now(),
    robotsAllowed: options.robotsAllowed,
    bytes: null,
    pages: null,
    sha256: null,
    convertedBytes: null,
  };

  if (!options.robotsAllowed) {
    return {
      entry: { ...base, status: "blocked", failureReason: "robots.txt disallows this path" },
      bytes: null,
    };
  }

  try {
    const outcome = await options.fetcher(document.url);
    if (outcome.status !== 200 || outcome.bytes === null) {
      return {
        entry: {
          ...base,
          status: "failed",
          failureReason: `HTTP ${outcome.status}${outcome.reason === null ? "" : `: ${outcome.reason}`}`,
        },
        bytes: null,
      };
    }
    return {
      entry: {
        ...base,
        status: "ok",
        bytes: outcome.bytes.byteLength,
        sha256: createHash("sha256").update(outcome.bytes).digest("hex"),
        failureReason: null,
      },
      bytes: outcome.bytes,
    };
  } catch (error) {
    return {
      entry: { ...base, status: "failed", failureReason: describe(error) },
      bytes: null,
    };
  }
}

/** Node wraps the useful network error in `cause`; the outer message is just "fetch failed". */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) return `${error.message}: ${cause.message}`;
  return error.message;
}
