import { describe, expect, it } from "vitest";
import { stalenessWarning } from "../../src/freshness.ts";

const at = (iso: string) => new Date(iso);

describe("stalenessWarning [FR-P2-17, D-067]", () => {
  it("says nothing while the wall clock is inside the plan year", () => {
    expect(stalenessWarning(2026, at("2026-09-08T00:00:00Z"))).toBeNull();
    expect(stalenessWarning(2026, at("2026-12-31T23:59:00Z"))).toBeNull();
  });

  it("warns once the year rolls over", () => {
    const warning = stalenessWarning(2026, at("2027-01-01T00:00:00Z"));
    expect(warning).not.toBeNull();
    expect(warning).toContain("2026");
    expect(warning).toContain("2027");
  });

  // Both years are named so a member sees the gap rather than trusting a label.
  it("names both years, the consequence and what to do", () => {
    const warning = stalenessWarning(2026, at("2028-03-01T00:00:00Z")) ?? "";
    expect(warning).toContain("2028");
    expect(warning).toMatch(/may have changed/i);
    expect(warning).toMatch(/call/i);
  });

  it("says nothing when the corpus is ahead of the clock", () => {
    expect(stalenessWarning(2027, at("2026-11-01T00:00:00Z"))).toBeNull();
  });

  it("uses plain words rather than insurance jargon", () => {
    const warning = stalenessWarning(2026, at("2027-06-01T00:00:00Z")) ?? "";
    expect(warning).not.toMatch(/plan year changed|stale|deprecated/i);
  });
});
