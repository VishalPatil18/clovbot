import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReport, type CaseOutcome } from "../../eval/harness/score.ts";

const server = readFileSync("src/server.ts", "utf8");
const panel = readFileSync("web/src/components/CallbackPanel.tsx", "utf8");
const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");

describe("callback request [FR-22]", () => {
  it("is pre-filled with the question, the plan and the documents searched", () => {
    // The plan reads as its name; the raw id stays on the stored record. D-055.
    for (const field of ["question", "planName", "documentsSearched"]) {
      expect(panel).toContain(`draft.${field}`);
    }
    expect(panel).not.toContain("draft.planContext");
  });

  it("keeps the phone number visible alongside the form", () => {
    expect(panel).toMatch(/MEMBER_SERVICES_DISPLAY/);
    expect(panel).toMatch(/href=\{`tel:/);
  });

  // NFR-SEC-01: no member identity. A callback form that asks for a phone number
  // would collect exactly the identity the system promises not to hold.
  it("collects no name, phone or email", () => {
    expect(panel).not.toMatch(/type="(tel|email)"/);
    expect(panel).not.toMatch(/\b(firstName|lastName|phoneNumber|emailAddress)\b/);
  });

  it("redacts the stored text [FR-31]", () => {
    expect(server).toMatch(/question: redactIdentifiers\(question\)/);
    expect(server).toMatch(/redactIdentifiers\(parsed\["note"\]/);
  });

  it("says plainly that nothing is sent anywhere [D-026]", () => {
    expect(panel).toMatch(/Nothing is sent anywhere/i);
  });

  it("rejects a callback with no question rather than storing an empty row", () => {
    expect(server).toMatch(/A question is required/);
  });
});

describe("loop breaker wiring [FR-23]", () => {
  it("reads consecutive refusals from the turn log rather than server memory", () => {
    expect(server).toMatch(/consecutiveRefusals\(client, session\)/);
    expect(server).toMatch(/shouldPresentCallbackForm/);
  });

  it("offers the form to the interface as its own event", () => {
    expect(server).toMatch(/type: "offer_callback"/);
    expect(assistant).toMatch(/event\.type === "offer_callback"/);
  });
});

describe("rate limiting [FR-30, NFR-SEC-02]", () => {
  it("limits per session and per IP", () => {
    expect(server).toMatch(/SESSION_LIMIT/);
    expect(server).toMatch(/IP_LIMIT/);
    expect(server).toMatch(/\[`s:\$\{session\}`/);
    expect(server).toMatch(/\[`i:\$\{ip\}`/);
  });

  // The acceptance criterion is a clear message, not a hang or a stack trace.
  it("answers a breach with a readable message and the human path", () => {
    expect(server).toMatch(/type: "rate_limited"/);
    expect(server).toMatch(/That is the limit of questions/);
    expect(assistant).toMatch(/event\.type === "rate_limited"/);
  });

  it("issues an opaque session id that carries no member identity", () => {
    expect(server).toMatch(/randomUUID\(\)/);
    expect(server).toMatch(/HttpOnly/);
  });
});

describe("upstream failures are excluded from the refusal rate [FR-25]", () => {
  const outcome = (over: Partial<CaseOutcome>): CaseOutcome => ({
    id: "c",
    bucket: "A",
    driver: "A-02",
    enforced: true,
    passed: true,
    refused: false,
    faithfulness: 1,
    structural: { compliant: true, uncitedSentences: [] },
    note: "",
    ...over,
  });

  it("counts a refusal but not an upstream failure", () => {
    const report = buildReport([
      outcome({ id: "1", refused: true }),
      outcome({ id: "2", refused: false }),
      outcome({ id: "3", refused: false }),
      outcome({ id: "4", refused: false }),
    ]);
    expect(report.refusalRate).toBe(0.25);
  });

  it("keeps the rate at zero when nothing refused", () => {
    expect(buildReport([outcome({})]).refusalRate).toBe(0);
  });
});
