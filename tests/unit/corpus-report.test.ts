import { describe, expect, it } from "vitest";
import { renderReport } from "../../src/corpus/report.ts";
import type { ManifestEntry, Snapshot } from "../../src/corpus/types.ts";

const entry = (over: Partial<ManifestEntry>): ManifestEntry => ({
  documentId: "d",
  kind: "evidence_of_coverage",
  contractId: "H5141",
  planId: "004",
  status: "ok",
  url: "https://x/d.pdf",
  retrievedAt: "2026-09-07T00:00:00.000Z",
  robotsAllowed: true,
  bytes: 6_667_431,
  pages: 199,
  sha256: "a".repeat(64),
  convertedBytes: 498_215,
  failureReason: null,
  ...over,
});

const snapshot = (entries: ManifestEntry[]): Snapshot => ({
  id: "2026-09-07T2231Z",
  createdAt: "2026-09-07T22:31:00.000Z",
  countyId: "34017",
  planYear: 2026,
  contractId: "H5141",
  planId: "004",
  entries,
});

describe("renderReport", () => {
  it("states the snapshot and scope it describes", () => {
    const md = renderReport(snapshot([entry({})]));
    expect(md).toContain("2026-09-07T2231Z");
    expect(md).toContain("H5141");
    expect(md).toContain("34017");
  });

  it("counts each status", () => {
    const md = renderReport(
      snapshot([
        entry({ documentId: "a" }),
        entry({ documentId: "b", status: "failed", failureReason: "HTTP 404" }),
        entry({ documentId: "c", status: "synthetic", failureReason: "not published" }),
      ]),
    );
    expect(md).toMatch(/ok.*1/);
    expect(md).toMatch(/failed.*1/);
    expect(md).toMatch(/synthetic.*1/);
  });

  // The acceptance criterion: every failure is named with a reason.
  it("names every failure with its reason", () => {
    const md = renderReport(
      snapshot([
        entry({ documentId: "broken", status: "failed", failureReason: "HTTP 404: Not Found" }),
        entry({ documentId: "walled", status: "blocked", failureReason: "robots.txt disallows" }),
      ]),
    );
    expect(md).toContain("broken");
    expect(md).toContain("HTTP 404: Not Found");
    expect(md).toContain("walled");
    expect(md).toContain("robots.txt disallows");
  });

  it("says so plainly when nothing failed", () => {
    expect(renderReport(snapshot([entry({})]))).toMatch(/no failures/i);
  });

  it("flags a converted size below its floor", () => {
    const md = renderReport(snapshot([entry({ convertedBytes: 12 })]));
    expect(md).toMatch(/below the .*floor/i);
  });

  it("does not flag a healthy conversion", () => {
    expect(renderReport(snapshot([entry({})]))).not.toMatch(/below the .*floor/i);
  });

  it("records robots compliance", () => {
    expect(renderReport(snapshot([entry({})]))).toMatch(/robots/i);
  });

  it("lists every document, not only the failures", () => {
    const md = renderReport(snapshot([entry({ documentId: "kept" })]));
    expect(md).toContain("kept");
  });
});
