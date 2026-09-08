import { describe, expect, it } from "vitest";
import { detectLanguage } from "../../src/language.ts";

describe("detectLanguage [FR-24]", () => {
  it("identifies English", () => {
    expect(detectLanguage("what is my copay for a specialist visit")).toBe("en");
  });

  it("identifies Spanish as unsupported", () => {
    expect(detectLanguage("cual es mi copago para una visita al especialista")).toBe("other");
  });

  it("does not classify a short English question as unsupported", () => {
    expect(detectLanguage("is dental covered")).toBe("en");
  });

  it("treats an empty question as English so it falls through to normal handling", () => {
    expect(detectLanguage("")).toBe("en");
  });
});
