import type { Citation, Claim, FeedbackReason, Headline } from "./api.ts";

export interface StoredTurn {
  id: number;
  question: string;
  answer: string;
  claims: Claim[];
  citations: Citation[];
  citationNumbers: Record<string, number>;
  unanswered: string[];
  headline: Headline | null;
  staleness: string | null;
  outcome: "answered" | "refused" | "upstream_failure" | "needs_login" | "pending";
  feedback: "yes" | "no" | null;
  /** Kept so a restored conversation does not ask for a reason twice. */
  feedbackReason: FeedbackReason | null;
  turnId: string | null;
}

export const HISTORY_KEY = "clovbot_history";

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Reached through globalThis rather than window so this module compiles in the
 * Node project the tests run under, and so a stub can replace it.
 */
const storage = (): KeyValueStore => {
  const store = (globalThis as { localStorage?: KeyValueStore }).localStorage;
  if (store === undefined) throw new Error("no storage");
  return store;
};

/** Bounded so a device used for months cannot fill the quota. */
export const MAX_TURNS = 50;

const isTurn = (value: unknown): value is StoredTurn => {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (
    typeof turn["question"] === "string" &&
    typeof turn["answer"] === "string" &&
    Array.isArray(turn["claims"]) &&
    // A turn without its sources would render claims with nothing behind them.
    Array.isArray(turn["citations"])
  );
};

/**
 * FR-P2-18. History is a convenience, so every path here degrades to empty
 * rather than throwing: private browsing rejects access outright, and a device
 * that has been used for months can reject a write. FR-P2-19.
 */
export function readHistory(): StoredTurn[] {
  try {
    const raw = storage().getItem(HISTORY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A conversation saved before the reason existed has none. Defaulting it
    // here rather than at every read site keeps the type honest.
    return parsed
      .filter(isTurn)
      .map((turn) => ({ ...turn, feedbackReason: turn.feedbackReason ?? null }))
      .slice(-MAX_TURNS);
  } catch {
    return [];
  }
}

export function writeHistory(turns: StoredTurn[]): void {
  try {
    const kept = turns.filter((turn) => turn.outcome !== "pending").slice(-MAX_TURNS);
    storage().setItem(HISTORY_KEY, JSON.stringify(kept));
  } catch {
    // Losing history is survivable; failing to answer is not.
  }
}

/**
 * Both labels, because `payload.ts` writes the citation in the answer's own
 * language. Matching only the English one left a Spanish member's claim data in
 * storage after they signed out.
 */
const MEMBER_RECORD_LABELS = ["Your member record", "Su registro de miembro"];

/** True when any citation on the turn came from the member's own record. */
export const isMemberTurn = (turn: { citations: { label: string }[] }): boolean =>
  turn.citations.some((citation) =>
    MEMBER_RECORD_LABELS.some((label) => citation.label.startsWith(label)),
  );

/**
 * FR-P2-39. Signing out on a shared device removes anything sourced from the
 * member's own record; answers from public documents are theirs to keep.
 */
export function clearMemberTurns(): StoredTurn[] {
  const kept = readHistory().filter((turn) => !isMemberTurn(turn));
  writeHistory(kept);
  return kept;
}

/** Removes the key itself, so clearing is verifiable by inspecting storage. */
export function clearHistory(): void {
  try {
    storage().removeItem(HISTORY_KEY);
  } catch {
    // Nothing to clear if storage is unreachable.
  }
}
