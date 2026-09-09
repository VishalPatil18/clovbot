import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStructuredPrompt } from "../../src/rag/payload.ts";
import { corpusLanguage, t } from "../../src/i18n.ts";

const payload = readFileSync("src/rag/payload.ts", "utf8");
const providers = readFileSync("src/voice/providers.ts", "utf8");
const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
const turn = readFileSync("src/rag/answer-turn.ts", "utf8");

const chunk = {
  id: "c1",
  documentId: "H5141-004-2026-evidence_of_coverage",
  kind: "evidence_of_coverage" as const,
  contractId: "H5141",
  planId: "004",
  planYear: 2026,
  section: "Costs",
  content: "The specialist copay is $10.",
};

describe("the Spanish instruction leaves the English prompt alone [D-069]", () => {
  // Touching the system prompt was measured to move faithfulness, so the
  // instruction rides on the user message instead.
  it("sends a byte-identical system prompt in both languages", () => {
    expect(buildStructuredPrompt("q", [chunk], "es").system).toBe(
      buildStructuredPrompt("q", [chunk], "en").system,
    );
  });

  it("leaves the English user message exactly as it was", () => {
    expect(buildStructuredPrompt("q", [chunk], "en").user).not.toMatch(/español/i);
    expect(buildStructuredPrompt("q", [chunk]).user).toBe(
      buildStructuredPrompt("q", [chunk], "en").user,
    );
  });

  it("asks for Spanish only when the turn is Spanish", () => {
    expect(buildStructuredPrompt("q", [chunk], "es").user).toMatch(/Responde en español/);
  });

  it("keeps the instruction out of the system prompt entirely", () => {
    expect(buildStructuredPrompt("q", [chunk], "es").system).not.toMatch(/español|spanish/i);
  });

  it("carries the instruction on the user message, where it costs nothing measured", () => {
    expect(payload).toMatch(/user: speech === "es"/);
  });
});

describe("member-facing copy exists in both languages [FR-P3-43, NFR-P3-12]", () => {
  it("translates every refusal path", () => {
    for (const key of ["toAPerson", "notFound", "upstream", "noAnswer", "unsupportedLanguage"] as const) {
      expect(t(key, "es"), key).not.toBe(t(key, "en"));
      expect(t(key, "es").length, key).toBeGreaterThan(0);
    }
  });

  it("still names Spanish as answerable rather than handing it over", () => {
    expect(t("unsupportedLanguage", "en")).toMatch(/English and Spanish/);
  });

  it("maps the interface code to the corpus tag", () => {
    expect(corpusLanguage("es")).toBe("spanish");
    expect(corpusLanguage("en")).toBe("english");
  });
});

describe("retrieval and the turn follow the language [FR-P3-32, FR-P3-34]", () => {
  it("scopes retrieval by it rather than filtering after", () => {
    expect(turn).toContain("language: corpusLanguage(speech)");
  });

  // A Spanish question is answered in Spanish whatever the setting says.
  it("lets a Spanish question override the setting", () => {
    expect(turn).toMatch(/detected === "es" \? "es" : \(options\.language \?\? "en"\)/);
  });

  it("reports what it answered in, so the interface can follow", () => {
    expect(turn).toContain("language: speech");
  });
});

describe("a Spanish answer is read in a Spanish voice [FR-P3-35]", () => {
  it("picks a per-language voice for both providers", () => {
    expect(providers).toContain("ELEVENLABS_VOICE_ID");
    expect(providers).toContain("FISH_AUDIO_VOICE_ID_SPANISH");
    expect(providers).toMatch(/voiceFor\("ELEVENLABS_VOICE_ID", speech\)/);
  });

  // A missing Spanish voice must degrade, not break the chain.
  it("falls back to the English voice rather than failing", () => {
    expect(providers).toMatch(/optional\(`\$\{base\}_SPANISH`\) : null\) \?\? required\(base\)/);
  });
});

describe("the language control [FR-P3-34]", () => {
  it("sits beside the voice control in the panel and in the rail", () => {
    expect(assistant).toMatch(/railId === undefined && modeControl\}\s*\n\s*\{railId === undefined && languageControl/);
    // The three controls travel together as one fragment now.
    expect(assistant).toMatch(/const controls = \([\s\S]{0,160}\{languageControl\}/);
  });

  it("carries an icon and a label", () => {
    expect(assistant).toContain("<IoLanguage aria-hidden=\"true\" />");
    expect(assistant).toMatch(/language === "es" \? "English" : "Español"/);
  });

  // Named in the language it switches to, so a member who cannot read the
  // current one can still find it.
  it("marks the label's own language for a screen reader", () => {
    expect(assistant).toMatch(/lang=\{language === "es" \? "en" : "es"\}/);
  });

  it("follows the answer, and does not go stale in the submit closure", () => {
    expect(assistant).toMatch(/event\.language !== undefined && event\.language !== language/);
    expect(assistant).toContain("[busy, language, mode]");
  });
});
