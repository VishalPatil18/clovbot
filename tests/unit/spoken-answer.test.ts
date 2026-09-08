import { describe, expect, it } from "vitest";
import { renderAnswer, spokenAnswer } from "../../src/rag/payload.ts";
import type { AnswerPayload } from "../../src/types.ts";

const chunk = (id: string, kind: "corporate" | "evidence_of_coverage", section: string) => ({
  id,
  documentId: `H5141-004-2026-${kind}`,
  kind,
  contractId: "H5141",
  planId: kind === "corporate" ? "*" : "004",
  planYear: 2026,
  section,
  content: "",
});

const CHUNKS = [
  chunk("a", "corporate", "Common Insurance Terms FAQ"),
  chunk("b", "evidence_of_coverage", "Chapter: Getting care > How to get care from specialists"),
];

const PAYLOAD: AnswerPayload = {
  claims: [
    { text: "You do not need a referral to see a specialist with Clover Health HMO and PPO plans.", citationIds: ["a"] },
    { text: "As a member of Clover Health H5141-004, you do not need a referral from your PCP.", citationIds: ["b"] },
  ],
  unanswered: [],
  refusal: null,
};

describe("spokenAnswer [FR-19]", () => {
  const spoken = spokenAnswer(PAYLOAD);

  it("speaks every claim", () => {
    for (const claim of PAYLOAD.claims) expect(spoken).toContain(claim.text);
  });

  // The citation list is on screen for reading, not for listening to.
  it("does not read the source list aloud", () => {
    expect(spoken).not.toMatch(/Where this comes from/i);
    expect(spoken).not.toContain("Common Insurance Terms FAQ");
    expect(spoken).not.toContain("Evidence of Coverage 2026");
  });

  it("does not read the citation markers aloud", () => {
    expect(spoken).not.toMatch(/\[\d+\]/);
  });

  it("is shorter than the written answer, which carries the sources", () => {
    expect(spoken.length).toBeLessThan(renderAnswer(PAYLOAD, CHUNKS).length);
  });

  // A gap is answer content, not provenance, so it is still spoken.
  it("speaks what could not be found", () => {
    const withGap: AnswerPayload = {
      ...PAYLOAD,
      unanswered: ["whether your own doctor takes this plan"],
    };
    const text = spokenAnswer(withGap);
    expect(text).toContain("whether your own doctor takes this plan");
    expect(text).not.toMatch(/Where this comes from/i);
  });

  it("speaks a refusal and the human path", () => {
    const refusal: AnswerPayload = {
      claims: [],
      unanswered: [],
      refusal: {
        trigger: "C-01",
        explanation: "I cannot judge whether a denial was correct.",
        humanPathOffered: true,
      },
    };
    const text = spokenAnswer(refusal);
    expect(text).toContain("cannot judge whether a denial was correct");
    expect(text).toContain("1-555-0100");
  });

  it("returns nothing to say when there is nothing to say", () => {
    expect(spokenAnswer({ claims: [], unanswered: [], refusal: null })).toBe("");
  });
});
