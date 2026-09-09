import { beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_KEY, MAX_TURNS, clearHistory, clearMemberTurns, readHistory, writeHistory } from "../../web/src/history.ts";

interface FakeStore {
  store: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const fakeStorage = (): FakeStore => {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
  };
};

const turn = (id: number) => ({
  id,
  question: `question ${id}`,
  answer: `answer ${id}`,
  claims: [{ text: `answer ${id}`, citationIds: ["c1"] }],
  citations: [{ id: "c1", number: 1, label: "Summary of Benefits 2026 · Doctor's Office", documentId: "d" }],
  citationNumbers: {},
  unanswered: [],
  headline: null,
  staleness: null,
  outcome: "answered" as const,
  feedback: null,
  feedbackReason: null,
  turnId: "t",
});

const install = (storage: unknown): void => {
  vi.stubGlobal("localStorage", storage);
};

describe("conversation history [FR-P2-18, FR-P2-19]", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("round-trips turns through storage", () => {
    const storage = fakeStorage();
    install(storage);
    writeHistory([turn(1), turn(2)]);
    expect(readHistory().map((t) => t.question)).toEqual(["question 1", "question 2"]);
  });

  it("keeps the newest turns when the cap is exceeded", () => {
    install(fakeStorage());
    const many = Array.from({ length: MAX_TURNS + 10 }, (_, i) => turn(i));
    writeHistory(many);
    const kept = readHistory();
    expect(kept).toHaveLength(MAX_TURNS);
    expect(kept.at(-1)?.question).toBe(`question ${MAX_TURNS + 9}`);
  });

  it("removes the key when history is cleared, not just the rendered list", () => {
    const storage = fakeStorage();
    install(storage);
    writeHistory([turn(1)]);
    clearHistory();
    expect(storage.store.has(HISTORY_KEY)).toBe(false);
    expect(readHistory()).toEqual([]);
  });

  // A private window throws on access. History is absent, nothing else breaks.
  it("returns nothing when reading throws", () => {
    install({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    expect(readHistory()).toEqual([]);
  });

  it("swallows a write that throws, so answering still works", () => {
    install({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    });
    expect(() => writeHistory([turn(1)])).not.toThrow();
  });

  it("ignores stored content that is not a turn list", () => {
    const storage = fakeStorage();
    install(storage);
    storage.store.set(HISTORY_KEY, '{"not":"an array"}');
    expect(readHistory()).toEqual([]);
    storage.store.set(HISTORY_KEY, "{{{");
    expect(readHistory()).toEqual([]);
  });

  // A restored turn without its sources would show claims with nothing behind
  // them, which is cite-or-refuse broken by a page reload.
  it("drops a stored turn whose citations are missing", () => {
    const storage = fakeStorage();
    install(storage);
    storage.store.set(
      HISTORY_KEY,
      JSON.stringify([{ ...turn(1), citations: undefined }, turn(2)]),
    );
    expect(readHistory().map((t) => t.question)).toEqual(["question 2"]);
  });
});

describe("signing out on a shared device [FR-P2-39]", () => {
  beforeEach(() => vi.unstubAllGlobals());

  const cited = (id: number, label: string) => ({
    ...turn(id),
    citations: [{ id: "c1", number: 1, label, documentId: "d" }],
  });

  it("removes turns sourced from the member's record", () => {
    const storage = fakeStorage();
    install(storage);
    writeHistory([
      cited(1, "Summary of Benefits 2026 · Plan H5141-004 · Doctor's Office"),
      cited(2, "Your member record · Claim CLM-0031 · What you owe"),
    ]);
    const kept = clearMemberTurns();
    expect(kept.map((t) => t.id)).toEqual([1]);
    expect(JSON.stringify(readHistory())).not.toContain("Your member record");
  });

  // A member keeps their own public questions; only their record data goes.
  it("leaves answers from public documents in place", () => {
    install(fakeStorage());
    writeHistory([cited(1, "Evidence of Coverage 2026 · Plan H5141-004 · Appeals")]);
    expect(clearMemberTurns()).toHaveLength(1);
  });

  it("removes a turn that cites both kinds, because it carries record data", () => {
    install(fakeStorage());
    writeHistory([
      {
        ...turn(1),
        citations: [
          { id: "c1", number: 1, label: "Summary of Benefits 2026 · Dental", documentId: "d" },
          { id: "c2", number: 2, label: "Your member record · Accumulators · Dental allowance left", documentId: "d" },
        ],
      },
    ]);
    expect(clearMemberTurns()).toEqual([]);
  });

  it("does nothing harmful when storage is unavailable", () => {
    install({
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    expect(() => clearMemberTurns()).not.toThrow();
  });
});
