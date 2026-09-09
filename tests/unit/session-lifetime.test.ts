import { describe, expect, it } from "vitest";
import { ABSOLUTE_MS, IDLE_MS, sessionState } from "../../src/auth/session.ts";

const start = new Date("2026-09-09T10:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);
const session = (lastSeenMs: number) => ({ createdAt: start, lastSeenAt: at(lastSeenMs) });

describe("sessionState [FR-P2-35, FR-P2-36]", () => {
  it("is live while the member is active", () => {
    expect(sessionState(session(0), at(60_000))).toBe("live");
    expect(sessionState(session(IDLE_MS - 1), at(IDLE_MS))).toBe("live");
  });

  // Shared and family devices are common in this population, so a walked-away
  // session must not stay open.
  it("expires after the idle window", () => {
    expect(sessionState(session(0), at(IDLE_MS))).toBe("idle");
    expect(sessionState(session(0), at(IDLE_MS + 1))).toBe("idle");
  });

  it("stays live while activity keeps refreshing it", () => {
    expect(sessionState(session(IDLE_MS * 2), at(IDLE_MS * 2 + 60_000))).toBe("live");
  });

  // The absolute cap bounds a session someone simply never closed.
  it("expires at the absolute cap however active it has been", () => {
    expect(sessionState(session(ABSOLUTE_MS), at(ABSOLUTE_MS))).toBe("expired");
    expect(sessionState({ createdAt: start, lastSeenAt: at(ABSOLUTE_MS + 1) }, at(ABSOLUTE_MS + 1))).toBe(
      "expired",
    );
  });

  it("reports the absolute cap rather than idleness when both have passed", () => {
    expect(sessionState(session(0), at(ABSOLUTE_MS + IDLE_MS))).toBe("expired");
  });

  it("caps at eight hours and idles at thirty minutes", () => {
    expect(IDLE_MS).toBe(30 * 60 * 1_000);
    expect(ABSOLUTE_MS).toBe(8 * 60 * 60 * 1_000);
  });
});
