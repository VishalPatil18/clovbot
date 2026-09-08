import { beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_KEY, MAX_TURNS, clearHistory, readHistory, writeHistory } from "../../web/src/history.ts";

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
