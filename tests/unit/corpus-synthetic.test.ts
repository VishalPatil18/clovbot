import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_BANNER,
  buildSyntheticProviderDirectory,
} from "../../src/corpus/synthetic.ts";

const SCOPE = { contractId: "H5141", planId: "004", planYear: 2026, countyName: "Hudson County" };

describe("buildSyntheticProviderDirectory", () => {
  const built = buildSyntheticProviderDirectory(SCOPE);

  it("marks the manifest entry synthetic rather than ok", () => {
    expect(built.entry.status).toBe("synthetic");
  });

  it("says in the entry why it is not real", () => {
    expect(built.entry.failureReason).toMatch(/not published|synthetic/i);
  });

  it("carries no source URL, because there is no source", () => {
    expect(built.entry.url).toBe("");
  });

  // CLAUDE.md rule 6: no invented Clover facts. This banner is the mitigation the
  // user accepted, so every citation drawn from this file renders as demo data.
  it("opens the document with a banner marking it demo data", () => {
    expect(built.markdown.startsWith(SYNTHETIC_BANNER)).toBe(true);
  });

  it("repeats the demo-data marker on every provider row", () => {
    const rows = built.markdown.split("\n").filter((l) => l.includes("Dr."));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toMatch(/DEMO DATA/);
  });

  it("names no real person", () => {
    expect(built.markdown).toMatch(/Example|Sample|Demo/i);
  });

  it("is deterministic, so a rebuild does not churn the snapshot", () => {
    expect(buildSyntheticProviderDirectory(SCOPE).markdown).toEqual(built.markdown);
  });

  it("scopes itself to the plan it was built for", () => {
    expect(built.markdown).toContain("H5141");
    expect(built.markdown).toContain("004");
    expect(built.markdown).toContain("Hudson County");
  });

  it("clears the byte floor for a provider directory", () => {
    expect(built.entry.convertedBytes).toBeGreaterThan(1_000);
  });
});
