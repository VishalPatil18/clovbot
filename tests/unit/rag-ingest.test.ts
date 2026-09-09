import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXCLUDED_KINDS, planIngest } from "../../src/rag/ingest.ts";
import type { DocumentKind, ManifestEntry, Snapshot } from "../../src/corpus/types.ts";

const entry = (
  documentId: string,
  kind: DocumentKind,
  over: Partial<ManifestEntry> = {},
): ManifestEntry => ({
  documentId,
  kind,
  language: "english",
  contractId: "H5141",
  planId: "004",
  status: "ok",
  url: "https://x",
  retrievedAt: "2026-09-07T00:00:00.000Z",
  robotsAllowed: true,
  bytes: 1,
  pages: 1,
  sha256: null,
  convertedBytes: 1,
  failureReason: null,
  ...over,
});

const snapshot = (entries: ManifestEntry[]): Snapshot => ({
  id: "snap-1",
  createdAt: "2026-09-07T00:00:00.000Z",
  countyId: "34017",
  planYear: 2026,
  plans: [
    { contractId: "H5141", planId: "004", planYear: 2026 },
    { contractId: "H5141", planId: "007", planYear: 2026 },
  ],
  entries,
});

const SOB = "Doctor’s Office In-Network:\nSpecialist visit: $10 copay";
const markdown = () => SOB;

describe("planIngest [FR-01]", () => {
  it("chunks a healthy document", () => {
    const { chunks } = planIngest(
      snapshot([entry("H5141-004-2026-summary_of_benefits", "summary_of_benefits")]),
      2026,
      markdown,
    );
    expect(chunks.length).toBeGreaterThan(0);
  });

  // Rejected at ingest, not filtered at query time.
  it("rejects an out-of-year document and indexes none of it", () => {
    const { chunks, rejected } = planIngest(
      snapshot([
        entry("H5141-004-2025-summary_of_benefits", "summary_of_benefits"),
        entry("H5141-004-2026-summary_of_benefits", "summary_of_benefits"),
      ]),
      2026,
      markdown,
    );
    expect(rejected.some((r) => r.documentId.includes("2025"))).toBe(true);
    expect(chunks.some((c) => c.documentId.includes("2025"))).toBe(false);
    expect(chunks.every((c) => c.planYear === 2026)).toBe(true);
  });

  it("says why each document was rejected", () => {
    const { rejected } = planIngest(
      snapshot([entry("H5141-004-2025-summary_of_benefits", "summary_of_benefits")]),
      2026,
      markdown,
    );
    expect(rejected[0]?.reason).toMatch(/2025/);
  });

  it("skips a document that failed to fetch", () => {
    const { chunks, rejected } = planIngest(
      snapshot([
        entry("broken", "summary_of_benefits", { status: "failed", failureReason: "HTTP 404" }),
      ]),
      2026,
      markdown,
    );
    expect(chunks).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/failed/);
  });

  it("skips a document with no converted markdown", () => {
    const { rejected } = planIngest(
      snapshot([entry("H5141-004-2026-summary_of_benefits", "summary_of_benefits")]),
      2026,
      () => null,
    );
    expect(rejected[0]?.reason).toMatch(/no converted markdown/);
  });

  // D-007: as prose these are hundreds of near-identical address rows.
  it("excludes the pharmacy directory, with the reason recorded", () => {
    const { chunks, rejected } = planIngest(
      snapshot([entry("H5141-2026-pharmacy_directory", "pharmacy_directory")]),
      2026,
      markdown,
    );
    expect(chunks).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/P2|D-007/);
    expect(EXCLUDED_KINDS).toContain("pharmacy_directory");
  });

  it("scopes the formulary to every plan, since one document serves both", () => {
    const { chunks } = planIngest(
      snapshot([entry("H5141-2026-formulary", "formulary", { planId: "" })]),
      2026,
      () => "ANALGESICS\n  MORPHINE SULFATE ER TABS 15mg 2 PA",
    );
    expect(chunks.every((c) => c.planId === "*")).toBe(true);
  });

  it("keeps a plan-specific document scoped to its own plan", () => {
    const { chunks } = planIngest(
      snapshot([
        entry("H5141-007-2026-summary_of_benefits", "summary_of_benefits", { planId: "007" }),
      ]),
      2026,
      markdown,
    );
    expect(chunks.every((c) => c.planId === "007")).toBe(true);
  });

  it("gives every chunk complete provenance [FR-04]", () => {
    const { chunks } = planIngest(
      snapshot([entry("H5141-004-2026-summary_of_benefits", "summary_of_benefits")]),
      2026,
      markdown,
    );
    for (const chunk of chunks) {
      expect(chunk.contractId).toBeTruthy();
      expect(chunk.planId).toBeTruthy();
      expect(chunk.planYear).toBe(2026);
      expect(chunk.section).toBeTruthy();
      expect(chunk.snapshotId).toBe("snap-1");
    }
  });

  it("is deterministic", () => {
    const snap = snapshot([entry("H5141-004-2026-summary_of_benefits", "summary_of_benefits")]);
    expect(planIngest(snap, 2026, markdown)).toEqual(planIngest(snap, 2026, markdown));
  });

  // Corporate pages share headings such as "Learn More"; without the document in
  // the id their chunks collide and one overwrites the other on upsert.
  it("emits no duplicate chunk id when two documents share a heading", () => {
    const { chunks } = planIngest(
      snapshot([
        entry("corporate-about-us-press", "corporate", { planId: "" }),
        entry("corporate-about-us-leadership", "corporate", { planId: "" }),
      ]),
      2026,
      () => "Learn More\nA sentence long enough to clear the corporate size floor for chunking.",
    );
    expect(chunks.length).toBe(2);
    expect(new Set(chunks.map((c) => c.id)).size).toBe(2);
  });

  it("emits no duplicate chunk id", () => {
    const { chunks } = planIngest(
      snapshot([
        entry("H5141-004-2026-summary_of_benefits", "summary_of_benefits"),
        entry("H5141-007-2026-summary_of_benefits", "summary_of_benefits", { planId: "007" }),
      ]),
      2026,
      markdown,
    );
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
  });
});

describe("contract-wide documents [D-056]", () => {
  const wide = (kind: DocumentKind): ManifestEntry => entry(`x-2026-${kind}`, kind);

  // Keyed on kind, not on what discover happened to stamp, so an older manifest
  // converges on the same scoping as a fresh one.
  it("scopes the formulary to every contract and plan", () => {
    const { chunks } = planIngest(snapshot([wide("formulary")]), 2026, markdown);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.contractId).toBe("*");
      expect(chunk.planId).toBe("*");
    }
  });

  it("scopes corporate pages the same way", () => {
    // Corporate chunks below MIN_CORPORATE_CHARS are dropped, so this body is long
    // enough to survive chunking and reach the scoping assertion.
    const prose = () => `# About Clover\n\n${"Clover Health is a Medicare Advantage plan. ".repeat(12)}`;
    const { chunks } = planIngest(snapshot([wide("corporate")]), 2026, prose);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.contractId).toBe("*");
      expect(chunk.planId).toBe("*");
    }
  });

  it("leaves a plan document scoped to its own contract and plan", () => {
    const document = entry("H8010-002-2026-summary_of_benefits", "summary_of_benefits", {
      contractId: "H8010",
      planId: "002",
    });
    const { chunks } = planIngest(snapshot([document]), 2026, markdown);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.contractId).toBe("H8010");
      expect(chunk.planId).toBe("002");
    }
  });
});

describe("the ingest survives its own pacing", () => {
  const cli = readFileSync("src/rag/cli.ts", "utf8");

  // A 40-minute ingest died at chunk 235 of 2737: one client was held open
  // across the loop, the pooler dropped it during a between-batch sleep, and pg
  // raised that as an unhandled error event rather than a rejected query.
  it("takes a connection per unit of work rather than holding one across the loop", () => {
    const ingest = cli.slice(cli.indexOf("const existing = await withAdmin"));
    expect(ingest).toContain("await withAdmin((client) => upsertChunks(client, batch, embeddings))");
    expect(ingest.slice(0, ingest.indexOf("snapshot ${snapshotId}"))).not.toMatch(
      /const client = connectAdmin\(\)/,
    );
  });

  it("handles the drop event, which is not a rejected promise", () => {
    expect(cli).toMatch(/client\.on\("error"/);
  });

  // Content comparison is what makes a crashed run resumable instead of wasted.
  it("skips chunks already stored, so a re-run continues where it stopped", () => {
    expect(cli).toMatch(/existing\.get\(chunk\.id\) !== `\$\{chunk\.contextPrefix\}/);
  });
});
