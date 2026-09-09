/** Idle first: a tablet left on a kitchen table is the common case. */
export const IDLE_MS = 30 * 60 * 1_000;

/** And a hard ceiling on one nobody ever closed. */
export const ABSOLUTE_MS = 8 * 60 * 60 * 1_000;

export type SessionState = "live" | "idle" | "expired";

/**
 * Whether a session still holds; the clock is a parameter so both boundaries are
 * testable. The absolute cap is checked first: it is the more accurate thing to say.
 */
export function sessionState(
  session: { createdAt: Date; lastSeenAt: Date },
  now: Date,
): SessionState {
  if (now.getTime() - session.createdAt.getTime() >= ABSOLUTE_MS) return "expired";
  if (now.getTime() - session.lastSeenAt.getTime() >= IDLE_MS) return "idle";
  return "live";
}
