import type { Citation, Claim, Headline } from "./api.ts";

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
  outcome: "answered" | "refused" | "upstream_failure" | "pending";
  feedback: "yes" | "no" | null;
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
    return parsed.filter(isTurn).slice(-MAX_TURNS);
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
 * FR-P2-39. Signing out on a shared device removes anything sourced from the
 * member's own record; answers from public documents are theirs to keep.
 */
export function clearMemberTurns(): StoredTurn[] {
  const kept = readHistory().filter(
    (turn) => !turn.citations.some((citation) => citation.label.startsWith("Your member record")),
  );
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
