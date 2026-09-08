import { describe, expect, it } from "vitest";
import { redactIdentifiers } from "../../src/logging.ts";

describe("redactIdentifiers [FR-31]", () => {
  it("removes a member id but keeps the question", () => {
    const redacted = redactIdentifiers("my member id is 1234567890, is an MRI covered");
    expect(redacted).not.toContain("1234567890");
    expect(redacted).toContain("is an MRI covered");
  });

  it("removes a social security number", () => {
    expect(redactIdentifiers("my ssn is 123-45-6789")).not.toContain("123-45-6789");
  });

  it("removes a date of birth", () => {
    expect(redactIdentifiers("I was born 04/12/1948, what is my copay")).not.toContain("04/12/1948");
  });

  it("keeps an ordinary number that is part of the question", () => {
    expect(redactIdentifiers("what is my copay for a 30 day supply")).toContain("30 day supply");
  });

  it("keeps a dollar amount", () => {
    expect(redactIdentifiers("is the $40 copay per visit or per year")).toContain("$40");
  });

  it("keeps a plan year", () => {
    expect(redactIdentifiers("what changed in 2026")).toContain("2026");
  });

  it("leaves a question with no identifiers untouched", () => {
    const question = "how does the appeals process work";
    expect(redactIdentifiers(question)).toBe(question);
  });

  it("is idempotent", () => {
    const once = redactIdentifiers("member id 1234567890");
    expect(redactIdentifiers(once)).toBe(once);
  });
});
