import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEEDBACK_REASONS } from "../../src/rag/store.ts";

const up = readFileSync("migrations/016_feedback.sql", "utf8");
const store = readFileSync("src/rag/store.ts", "utf8");
const server = readFileSync("src/server.ts", "utf8");
const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
const api = readFileSync("web/src/api.ts", "utf8");
const ops = readFileSync("src/ops.ts", "utf8");

describe("a rating is stored with what it rated [FR-P3-63, FR-P3-64]", () => {
  it("records the answer the member actually read", () => {
    expect(up).toMatch(/alter table turns add column if not exists answer text/);
    expect(store).toMatch(/latency_ms, session_id, refusal_trigger, route, route_reason, answer/);
  });

  // A signed-in member's answer holds their record, and this table has no
  // policy over it. Keeping it out beats writing it and protecting it.
  it("stores no answer for a turn that had a member", () => {
    expect(server).toMatch(/answer: member === null \? turn\.answer : null/);
  });

  it("timestamps the rating separately from the question", () => {
    expect(up).toMatch(/feedback_at timestamptz/);
    expect(store).toMatch(/feedback_at = now\(\)/);
  });
});

describe("the reason is one of four, never free text [FR-P3-65]", () => {
  it("is constrained by the database, not only by the form", () => {
    expect(up).toMatch(/turns_feedback_reason_check/);
    for (const reason of FEEDBACK_REASONS) expect(up, reason).toContain(`'${reason}'`);
  });

  // The endpoint is the surface an attacker or a bug would reach first.
  // The filter moved into the shared validator; the endpoint hands it the list.
  it("drops anything the endpoint is sent that is not one of the four", () => {
    expect(server).toMatch(/feedbackRequest\(body, FEEDBACK_REASONS\)/);
    const validate = readFileSync("src/validate.ts", "utf8");
    expect(validate).toMatch(/allowed\.find\(\(candidate\) => candidate === fields\["reason"\]\) \?\? null/);
  });

  it("offers no text input anywhere in the feedback surface", () => {
    const feedback = assistant.slice(assistant.indexOf('className="feedback"'));
    expect(feedback.slice(0, 3000)).not.toMatch(/<textarea|type="text"/);
  });

  it("keeps the wire value and the label from drifting apart", () => {
    expect(assistant).toMatch(/satisfies readonly \{ value: FeedbackReason; key: StringKey \}\[\]/);
    for (const reason of FEEDBACK_REASONS) expect(api, reason).toContain(`"${reason}"`);
  });

  // A reason is an offer, not a toll on saying the answer failed.
  it("sends the no before asking why", () => {
    // Anchored on the call, not on a comment beside it.
    expect(assistant).toMatch(/sendFeedback\(\s*turn\.turnId,\s*value === "yes",\s*\)/);
  });

  it("asks only after a no, and only once", () => {
    expect(assistant).toMatch(/turn\.feedback === "no" && turn\.feedbackReason === null/);
  });
});

describe("analysis is blind to the session [FR-P3-66]", () => {
  // Pseudonymous, not anonymous: the view keeps a report about answers from
  // linking every question in one visit.
  it("excludes the session id from the view analysis reads", () => {
    const view = up.slice(up.indexOf("create or replace view feedback_report"));
    expect(view).not.toMatch(/session_id/);
    expect(view).toMatch(/member_feedback is not null/);
  });

  it("reads the report through the view rather than the table", () => {
    expect(ops).toMatch(/from feedback_report/);
    const report = ops.slice(ops.indexOf("Why not, when they said"));
    expect(report).not.toMatch(/from turns\b/);
  });

  // The loop breaker counts consecutive refusals within a session, so the
  // column has to stay on the table it reads.
  it("leaves the session id on the turn itself", () => {
    expect(up).not.toMatch(/drop column .*session_id|set session_id = null/);
  });
});

describe("the data has somewhere to go [FR-P3-67]", () => {
  it("lists rated-wrong answers as golden-set candidates", () => {
    expect(ops).toContain("candidates for the golden set");
    expect(ops).toMatch(/member_feedback = 'not_resolved'/);
  });

  it("counts the reasons, so a pattern is visible rather than a total", () => {
    expect(ops).toMatch(/group by feedback_reason order by n desc/);
  });

  it("says plainly when an answer was not stored", () => {
    expect(ops).toContain("not stored: a signed-in turn");
  });
});
