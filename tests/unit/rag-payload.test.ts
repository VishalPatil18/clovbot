import { describe, expect, it } from "vitest";
import { buildStructuredPrompt, citationLabel, renderAnswer } from "../../src/rag/payload.ts";
import type { AnswerPayload } from "../../src/types.ts";

const chunk = (over: Partial<Parameters<typeof citationLabel>[0]> = {}) => ({
  id: "sob-01",
  documentId: "H5141-004-2026-summary_of_benefits",
  kind: "summary_of_benefits" as const,
  contractId: "H5141",
  planId: "004",
  planYear: 2026,
  section: "Doctor’s Office",
  content: "Specialist visit: $10 copay",
  ...over,
});

describe("citationLabel [FR-06]", () => {
  it("renders document, plan year, contract and section", () => {
    const label = citationLabel(chunk());
    expect(label).toContain("Summary of Benefits");
    expect(label).toContain("2026");
    expect(label).toContain("H5141-004");
    expect(label).toContain("Doctor’s Office");
  });

  // A citation without a plan year is not a valid citation.
  it("refuses to render a citation with no plan year", () => {
    expect(() => citationLabel(chunk({ planYear: Number.NaN }))).toThrow(/plan year/i);
  });

  it("refuses to render a citation with no contract", () => {
    expect(() => citationLabel(chunk({ contractId: "" }))).toThrow(/contract/i);
  });
});

describe("buildStructuredPrompt [FR-32]", () => {
  const prompt = buildStructuredPrompt("what is the specialist copay", [chunk()]);

  it("asks for claims each carrying their own citation ids", () => {
    expect(prompt.system).toMatch(/citationIds/);
    expect(prompt.system).toMatch(/claims/);
  });

  it("asks for unanswered parts to be listed separately [FR-05]", () => {
    expect(prompt.system).toMatch(/unanswered/);
  });

  it("describes refusal as its own branch", () => {
    expect(prompt.system).toMatch(/refusal/);
  });

  it("fences the sources as data [NFR-SEC-04]", () => {
    expect(prompt.user).toContain("<sources>");
    expect(prompt.system).toMatch(/never.*instruction|data, not instruction/i);
  });

  it("tells the model the Evidence of Coverage controls a conflict [FR-07]", () => {
    expect(prompt.system).toMatch(/evidence of coverage/i);
  });

  it("refuses to build a prompt with no sources", () => {
    expect(() => buildStructuredPrompt("q", [])).toThrow(/no sources/i);
  });
});

describe("renderAnswer", () => {
  const chunks = [chunk()];

  it("renders each claim with its citation", () => {
    const payload: AnswerPayload = {
      claims: [{ text: "Your specialist copay is $10.", citationIds: ["sob-01"] }],
      unanswered: [],
      refusal: null, headline: null,
    };
    const rendered = renderAnswer(payload, chunks);
    expect(rendered).toContain("$10");
    expect(rendered).toContain("Summary of Benefits");
    expect(rendered).toContain("2026");
  });

  // The unsupported part is named explicitly, never silently dropped.
  it("names what it could not answer", () => {
    const payload: AnswerPayload = {
      claims: [{ text: "Your specialist copay is $10.", citationIds: ["sob-01"] }],
      unanswered: ["whether your specific doctor is in network"],
      refusal: null, headline: null,
    };
    const rendered = renderAnswer(payload, chunks);
    expect(rendered).toContain("whether your specific doctor is in network");
    expect(rendered).toMatch(/could not find|not in the/i);
  });

  it("renders a refusal with its explanation and the human path", () => {
    const payload: AnswerPayload = {
      claims: [],
      unanswered: [],
      refusal: {
        trigger: "C-01",
        explanation: "I cannot evaluate whether a denial was correct.",
        humanPathOffered: true,
      },
      headline: null,
    };
    const rendered = renderAnswer(payload, chunks);
    expect(rendered).toContain("cannot evaluate");
    expect(rendered).toMatch(/1-555-0100/);
  });

  it("offers the human path on a refusal even with no chunks", () => {
    const payload: AnswerPayload = {
      claims: [],
      unanswered: [],
      refusal: { trigger: "C-10", explanation: "Not found.", humanPathOffered: true }, headline: null,
    };
    // The number must be obviously fake on an unaffiliated deploy.
    expect(renderAnswer(payload, [])).toMatch(/1-555-0100/);
    expect(renderAnswer(payload, [])).not.toMatch(/1-888-778-1478/);
  });
});
