import { describe, expect, it } from "vitest";
import { answerAsText } from "../../web/src/copy.ts";

const turn = {
  question: "what is my specialist copay",
  answer: "You pay $10.",
  claims: [{ text: "You pay $10 for an in-network specialist.", citationIds: ["c1"] }],
  citations: [
    { id: "c1", number: 1, label: "Summary of Benefits 2026 · Plan H5141-004 · Doctor's Office", documentId: "d" },
  ],
  unanswered: [],
  staleness: null,
};

describe("answerAsText [FR-P2-21]", () => {
  const text = answerAsText(turn, "Clover Health Choice (PPO)", "2026-09-08");

  it("carries the question and the answer", () => {
    expect(text).toContain("what is my specialist copay");
    expect(text).toContain("You pay $10 for an in-network specialist.");
  });

  // A pasted answer with no source is an uncited claim in someone's inbox.
  it("carries every source, in full", () => {
    expect(text).toContain("Summary of Benefits 2026 · Plan H5141-004 · Doctor's Office");
  });

  it("names the plan and the document date it came from", () => {
    expect(text).toContain("Clover Health Choice (PPO)");
    expect(text).toContain("2026-09-08");
  });

  it("carries the staleness notice when there is one", () => {
    const stale = answerAsText(
      { ...turn, staleness: "These are your 2026 plan documents. It is now 2027." },
      "Clover Health Choice (PPO)",
      "2026-09-08",
    );
    expect(stale).toContain("It is now 2027");
  });

  it("carries what could not be answered, so a gap is not lost in the paste", () => {
    const gapped = answerAsText({ ...turn, unanswered: ["out-of-network dental"] }, "P", "d");
    expect(gapped).toContain("out-of-network dental");
  });

  it("falls back to the rendered answer when there are no claims", () => {
    const refused = answerAsText({ ...turn, claims: [], citations: [] }, "P", "d");
    expect(refused).toContain("You pay $10.");
  });

  it("is plain text with no markup or markdown", () => {
    expect(text).not.toMatch(/[<>*_`]|\[\d+\]\(/);
  });
});
