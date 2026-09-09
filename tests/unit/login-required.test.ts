import { describe, expect, it } from "vitest";
import { needsMemberData } from "../../src/auth/login-required.ts";

const gated = (question: string) => needsMemberData(question) !== null;

describe("needsMemberData, the gating direction [FR-P2-42, NFR-P2-02]", () => {
  // Discloses nothing, since the query layer refuses without a session, but it
  // answers a member question without identity, which the eval gates at zero.
  it("gates a question about a claim", () => {
    for (const q of [
      "what did my last claim cost",
      "has my claim been paid",
      "show me my claims",
      "how much did I owe on my last bill",
      "what does my explanation of benefits say",
    ]) expect(gated(q), q).toBe(true);
  });

  it("gates a question about a prior authorisation the member has filed", () => {
    for (const q of [
      "what is the status of my prior authorization",
      "was my prior auth approved",
      "did my authorization go through",
    ]) expect(gated(q), q).toBe(true);
  });

  it("gates a question about how much of an allowance is left", () => {
    for (const q of [
      "how much of my dental allowance is left",
      "how much have I spent this year",
      "what is my out of pocket maximum so far",
      "what is my remaining hearing benefit",
      "what is my deductible balance",
      "what drug payment stage am I in",
    ]) expect(gated(q), q).toBe(true);
  });

  it("gates a question about the member's own visits or provider", () => {
    for (const q of [
      "when was my last appointment",
      "who is my primary care provider",
      "who is my assigned doctor",
    ]) expect(gated(q), q).toBe(true);
  });
});

describe("needsMemberData, the direction that must not fire [FR-P2-44]", () => {
  /*
   * A possessive is not the signal. The plan documents answer all of these, and
   * gating one behind a login is the failure the eval gates at 95%.
   */
  it("never gates a cost question the plan documents answer", () => {
    for (const q of [
      "what is my specialist copay",
      "what is my copay for a specialist visit",
      "what is my out of pocket maximum",
      "what is my deductible",
      "what is my premium",
      "how much is an emergency room visit",
    ]) expect(gated(q), q).toBe(false);
  });

  it("never gates a coverage or formulary question", () => {
    for (const q of [
      "is a hearing aid covered",
      "what tier is my drug on",
      "is my medication covered",
      "does my plan cover dental",
    ]) expect(gated(q), q).toBe(false);
  });

  it("never gates a process question, including about authorisations in general", () => {
    for (const q of [
      "how do I file an appeal",
      "how do I file a claim",
      "what is prior authorization",
      "does an MRI need prior authorization",
      "which services need prior authorization",
      "how does the appeals process work",
    ]) expect(gated(q), q).toBe(false);
  });

  it("never gates a question about finding care", () => {
    for (const q of [
      "how do I find a doctor in my network",
      "is Dr Alvarez in my network",
      "which pharmacies near me are in network",
    ]) expect(gated(q), q).toBe(false);
  });
});

describe("what the member is told", () => {
  it("names the reason in plain words rather than stonewalling", () => {
    const hit = needsMemberData("what did my last claim cost");
    expect(hit?.explanation).toMatch(/your own record|sign in/i);
    expect(hit?.explanation).not.toMatch(/unauthori[sz]ed|denied|forbidden/i);
  });

  it("labels which kind of record data it needs, for the confusion matrix", () => {
    expect(needsMemberData("what did my last claim cost")?.topic).toBe("claim");
    expect(needsMemberData("when was my last appointment")?.topic).toBe("appointment");
  });
});
