import { describe, expect, it, vi } from "vitest";
import { fetchDocuments, isPathAllowed } from "../../src/corpus/fetch.ts";
import type { SourceDocument } from "../../src/corpus/types.ts";

const doc = (id: string, url: string): SourceDocument => ({
  id,
  kind: "evidence_of_coverage",
  url,
  contractId: "H5141",
  planId: "004",
  planYear: 2026,
  language: "english",
});

const options = (fetcher: Parameters<typeof fetchDocuments>[1]["fetcher"]) => ({
  fetcher,
  delayMs: 1_000,
  now: () => "2026-09-07T00:00:00.000Z",
  sleep: vi.fn(async () => {}),
  robotsAllowed: true,
});

describe("isPathAllowed", () => {
  it("allows everything under a permissive robots.txt", () => {
    expect(isPathAllowed("User-agent: *\nAllow: /", "/members/plan-documents")).toBe(true);
  });

  it("honours a disallowed prefix", () => {
    expect(isPathAllowed("User-agent: *\nDisallow: /filer/", "/filer/file/123/4/")).toBe(false);
  });

  it("leaves other paths allowed when one prefix is disallowed", () => {
    expect(isPathAllowed("User-agent: *\nDisallow: /filer/", "/members/x")).toBe(true);
  });

  it("treats a bare Disallow with no value as allowing everything", () => {
    expect(isPathAllowed("User-agent: *\nDisallow:", "/anything")).toBe(true);
  });

  it("ignores rules aimed at another user agent", () => {
    expect(isPathAllowed("User-agent: Googlebot\nDisallow: /\n", "/members")).toBe(true);
  });

  it("blocks everything when the wildcard agent is disallowed at root", () => {
    expect(isPathAllowed("User-agent: *\nDisallow: /", "/members")).toBe(false);
  });
});

describe("fetchDocuments", () => {
  const body = new TextEncoder().encode("%PDF-1.7 hello");

  it("records a successful fetch with its hash and size", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, bytes: body, reason: null }));
    const [result] = await fetchDocuments([doc("a", "https://x/a.pdf")], options(fetcher));

    expect(result?.entry.status).toBe("ok");
    expect(result?.entry.bytes).toBe(body.byteLength);
    expect(result?.entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result?.entry.failureReason).toBeNull();
    expect(result?.bytes).toEqual(body);
  });

  it("records a 404 as failed with a reason instead of throwing", async () => {
    const fetcher = vi.fn(async () => ({ status: 404, bytes: null, reason: "Not Found" }));
    const [result] = await fetchDocuments([doc("a", "https://x/a.pdf")], options(fetcher));

    expect(result?.entry.status).toBe("failed");
    expect(result?.entry.failureReason).toContain("404");
    expect(result?.entry.sha256).toBeNull();
  });

  it("records a thrown network error as failed", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const [result] = await fetchDocuments([doc("a", "https://x/a.pdf")], options(fetcher));

    expect(result?.entry.status).toBe("failed");
    expect(result?.entry.failureReason).toContain("ECONNRESET");
  });

  it("never leaves a status blank", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("b.pdf")
        ? { status: 500, bytes: null, reason: "Server Error" }
        : { status: 200, bytes: body, reason: null },
    );
    const results = await fetchDocuments(
      [doc("a", "https://x/a.pdf"), doc("b", "https://x/b.pdf")],
      options(fetcher),
    );
    expect(results.map((r) => r.entry.status)).toEqual(["ok", "failed"]);
  });

  it("waits between requests but not before the first", async () => {
    const opts = options(vi.fn(async () => ({ status: 200, bytes: body, reason: null })));
    await fetchDocuments(
      [doc("a", "https://x/a.pdf"), doc("b", "https://x/b.pdf"), doc("c", "https://x/c.pdf")],
      opts,
    );
    expect(opts.sleep).toHaveBeenCalledTimes(2);
    expect(opts.sleep).toHaveBeenCalledWith(1_000);
  });

  it("records robots compliance on every entry", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, bytes: body, reason: null }));
    const [result] = await fetchDocuments([doc("a", "https://x/a.pdf")], options(fetcher));
    expect(result?.entry.robotsAllowed).toBe(true);
  });

  it("marks a document blocked and does not fetch it when robots disallows", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, bytes: body, reason: null }));
    const [result] = await fetchDocuments([doc("a", "https://x/a.pdf")], {
      ...options(fetcher),
      robotsAllowed: false,
    });

    expect(result?.entry.status).toBe("blocked");
    expect(result?.entry.failureReason).toMatch(/robots/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("carries document identity onto the manifest entry", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, bytes: body, reason: null }));
    const [result] = await fetchDocuments([doc("a", "https://x/a.pdf")], options(fetcher));
    expect(result?.entry).toMatchObject({
      documentId: "a",
      kind: "evidence_of_coverage",
      url: "https://x/a.pdf",
      retrievedAt: "2026-09-07T00:00:00.000Z",
    });
  });
});
