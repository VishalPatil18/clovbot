import { describe, expect, it } from "vitest";
import { detectLanguage } from "../../src/language.ts";

describe("detectLanguage [FR-24]", () => {
  it("identifies English", () => {
    expect(detectLanguage("what is my copay for a specialist visit")).toBe("en");
  });

  // FR-P3-42 amends FR-24: Spanish is answered, every other language is not.
  it("identifies Spanish as Spanish", () => {
    expect(detectLanguage("cual es mi copago para una visita al especialista")).toBe("es");
    expect(detectLanguage("¿cuánto cuesta ver a un especialista?")).toBe("es");
    expect(detectLanguage("que medicamentos cubre mi plan")).toBe("es");
  });

  it("still refuses a language with no source documents", () => {
    expect(detectLanguage("quel est mon ticket moderateur pour un specialiste")).toBe("other");
    expect(detectLanguage("quanto costa una visita dal medico specialista")).toBe("other");
  });

  // A false Spanish verdict answers from a corpus the member did not ask against.
  it("does not read an English question as Spanish", () => {
    for (const question of [
      "what is my copay for a specialist visit",
      "is my plan covering dental",
      "how much do I pay for a doctor visit",
    ]) {
      expect(detectLanguage(question), question).toBe("en");
    }
  });

  it("does not classify a short English question as unsupported", () => {
    expect(detectLanguage("is dental covered")).toBe("en");
  });

  it("treats an empty question as English so it falls through to normal handling", () => {
    expect(detectLanguage("")).toBe("en");
  });
});
