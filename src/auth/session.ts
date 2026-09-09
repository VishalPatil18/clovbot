/** FR-P2-35. Idle first: a tablet left on a kitchen table is the common case. */
export const IDLE_MS = 30 * 60 * 1_000;

/** FR-P2-35. And a hard ceiling on one nobody ever closed. */
export const ABSOLUTE_MS = 8 * 60 * 60 * 1_000;

export type SessionState = "live" | "idle" | "expired";

/**
 * Whether a session still holds. The clock is a parameter so both boundaries
 * are tested rather than waited for.
 *
 * The absolute cap is checked first: when both have passed, "expired" is the
 * more accurate thing to tell a member, because signing in again is the only
 * way back either way and idleness would suggest otherwise.
 */
export function sessionState(
  session: { createdAt: Date; lastSeenAt: Date },
  now: Date,
): SessionState {
  if (now.getTime() - session.createdAt.getTime() >= ABSOLUTE_MS) return "expired";
  if (now.getTime() - session.lastSeenAt.getTime() >= IDLE_MS) return "idle";
  return "live";
}
