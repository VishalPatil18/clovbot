import { describe, expect, it } from "vitest";
import { findContainmentViolations, validateAnswerPayload } from "../../src/answer.ts";
import type { AnswerPayload } from "../../src/types.ts";

const VALID: AnswerPayload = {
  claims: [{ text: "Your specialist copay is $45.", citationIds: ["eoc-specialist-copay-01"] }],
  unanswered: [],
  refusal: null, headline: null,
};

describe("validateAnswerPayload [FR-32]", () => {
  it("accepts a claim carrying a citation", () => {
    const result = validateAnswerPayload(VALID);
    expect(result.ok).toBe(true);
  });

  it("rejects a claim with an empty citation list", () => {
    const result = validateAnswerPayload({ ...VALID, claims: [{ text: "Your copay is $45.", citationIds: [] }] });
    expect(result.ok).toBe(false);
  });

  it("rejects a claim with no citation field at all", () => {
    const result = validateAnswerPayload({ ...VALID, claims: [{ text: "Your copay is $45." }] });
    expect(result.ok).toBe(false);
  });

  it("accepts a refusal branch with a trigger and a human path", () => {
    const result = validateAnswerPayload({
      claims: [],
      unanswered: [],
      refusal: { trigger: "C-01", explanation: "I cannot evaluate a denial.", humanPathOffered: true },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a refusal that offers no human path", () => {
    const result = validateAnswerPayload({
      claims: [],
      unanswered: [],
      refusal: { trigger: "C-01", explanation: "I cannot help.", humanPathOffered: false },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown refusal trigger", () => {
    const result = validateAnswerPayload({
      claims: [],
      unanswered: [],
      refusal: { trigger: "C-99", explanation: "x", humanPathOffered: true },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a payload that both claims and refuses", () => {
    const result = validateAnswerPayload({
      ...VALID,
      refusal: { trigger: "C-01", explanation: "x", humanPathOffered: true },
    });
    expect(result.ok).toBe(false);
  });

  it("reports errors rather than throwing on malformed input", () => {
    const result = validateAnswerPayload("not an object");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("findContainmentViolations [FR-32]", () => {
  it("returns nothing when every cited chunk was retrieved", () => {
    expect(findContainmentViolations(VALID, ["eoc-specialist-copay-01", "sob-specialist-copay-01"])).toEqual([]);
  });

  it("catches a citation to a chunk that was never retrieved", () => {
    expect(findContainmentViolations(VALID, ["sob-specialist-copay-01"])).toEqual([
      "eoc-specialist-copay-01",
    ]);
  });

  it("catches a fabricated citation id", () => {
    const payload: AnswerPayload = {
      claims: [{ text: "Your copay is $45.", citationIds: ["sob-invented-99"] }],
      unanswered: [],
      refusal: null, headline: null,
    };
    expect(findContainmentViolations(payload, ["eoc-specialist-copay-01"])).toEqual(["sob-invented-99"]);
  });

  it("reports every violating id, not only the first", () => {
    const payload: AnswerPayload = {
      claims: [
        { text: "a", citationIds: ["ghost-1"] },
        { text: "b", citationIds: ["ghost-2"] },
      ],
      unanswered: [],
      refusal: null, headline: null,
    };
    expect(findContainmentViolations(payload, []).sort()).toEqual(["ghost-1", "ghost-2"]);
  });
});

describe("headline amount [FR-P2-13, D-064]", () => {
  const base = {
    claims: [{ text: "You pay $10 for a specialist visit.", citationIds: ["c1"] }],
    unanswered: [],
    refusal: null, headline: null,
  };

  it("accepts a payload with no headline, which is the prose path", () => {
    const result = validateAnswerPayload(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.headline).toBeNull();
  });

  it("accepts a cited headline", () => {
    const result = validateAnswerPayload({
      ...base,
      headline: { label: "Specialist visit, in-network", amount: "$10", citationIds: ["c1"] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.headline?.amount).toBe("$10");
  });

  // The largest element on the screen cannot be the one uncited element.
  it("rejects a headline with no citation", () => {
    const result = validateAnswerPayload({
      ...base,
      headline: { label: "Specialist visit", amount: "$10", citationIds: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/headline/i);
  });

  it("rejects a headline with no amount", () => {
    const result = validateAnswerPayload({
      ...base,
      headline: { label: "Specialist visit", amount: "", citationIds: ["c1"] },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a headline with no label, since a bare number is ambiguous", () => {
    const result = validateAnswerPayload({
      ...base,
      headline: { label: "", amount: "$10", citationIds: ["c1"] },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a headline that is not an object", () => {
    expect(validateAnswerPayload({ ...base, headline: "$10" }).ok).toBe(false);
  });

  it("rejects a headline on a refusal, which asserts and declines at once", () => {
    const result = validateAnswerPayload({
      claims: [],
      unanswered: [],
      refusal: { trigger: "C-01", explanation: "no" },
      headline: { label: "Specialist", amount: "$10", citationIds: ["c1"] },
    });
    expect(result.ok).toBe(false);
  });
});
