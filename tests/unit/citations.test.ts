import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { citationLabel, numberCitations, renderAnswer } from "../../src/rag/payload.ts";
import type { AnswerPayload } from "../../src/types.ts";

const chunk = (id: string, kind: "summary_of_benefits" | "evidence_of_coverage", section: string) => ({
  id,
  documentId: `H5141-004-2026-${kind}`,
  kind,
  contractId: "H5141",
  planId: "004",
  planYear: 2026,
  section,
  content: "",
});

const CHUNKS = [
  chunk("a", "summary_of_benefits", "SECTION II – SUMMARY OF BENEFITS > Doctor’s Office"),
  chunk("b", "evidence_of_coverage", "Chapter: Medical Benefits Chart > The Medical Benefits Chart shows your medical benefits and cost sharing"),
];

const PAYLOAD: AnswerPayload = {
  claims: [
    { text: "The in-network specialist copay is $10 per visit.", citationIds: ["a", "b"] },
    { text: "The out-of-network specialist copay is $20 per visit.", citationIds: ["a"] },
  ],
  unanswered: [],
  refusal: null,
};

describe("citationLabel trimming", () => {
  // Heading paths can be wrapped body sentences, so a section is trimmed for display.
  it("shortens a section that is really a wrapped sentence", () => {
    const label = citationLabel(CHUNKS[1]!);
    expect(label.length).toBeLessThan(90);
    expect(label).toMatch(/\.\.\.$/);
  });

  it("keeps a real section intact", () => {
    expect(citationLabel(CHUNKS[0]!)).toContain("Doctor’s Office");
  });

  it("keeps all four provenance fields [FR-06]", () => {
    const label = citationLabel(CHUNKS[0]!);
    expect(label).toContain("Summary of Benefits");
    expect(label).toContain("2026");
    expect(label).toContain("H5141-004");
  });

  it("drops the Chapter prefix, which repeats in every EOC citation", () => {
    expect(citationLabel(CHUNKS[1]!)).not.toMatch(/Chapter:/);
  });
});

describe("numberCitations", () => {
  it("numbers sources in order of first appearance", () => {
    const numbered = numberCitations(PAYLOAD, CHUNKS);
    expect(numbered.map((entry) => [entry.chunk.id, entry.number])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("numbers a repeated source once", () => {
    expect(numberCitations(PAYLOAD, CHUNKS)).toHaveLength(2);
  });

  it("ignores a citation whose chunk was not retrieved", () => {
    const payload: AnswerPayload = {
      claims: [{ text: "x", citationIds: ["ghost"] }],
      unanswered: [],
      refusal: null,
    };
    expect(numberCitations(payload, CHUNKS)).toHaveLength(0);
  });
});

describe("renderAnswer uses markers, not inline provenance", () => {
  const rendered = renderAnswer(PAYLOAD, CHUNKS);

  it("puts a short marker beside each claim", () => {
    expect(rendered).toContain("The in-network specialist copay is $10 per visit. [1][2]");
    expect(rendered).toContain("The out-of-network specialist copay is $20 per visit. [1]");
  });

  // The defect this replaces: a 109-character median citation mid-sentence,
  // repeated verbatim in the list below it.
  it("keeps the full label out of the sentence", () => {
    const firstLine = rendered.split("\n")[0] ?? "";
    expect(firstLine).not.toContain("Summary of Benefits");
    expect(firstLine.length).toBeLessThan(70);
  });

  it("lists each source once, numbered", () => {
    expect(rendered).toMatch(/Where this comes from:/);
    expect(rendered).toMatch(/\[1\] Summary of Benefits 2026/);
    expect(rendered).toMatch(/\[2\] Evidence of Coverage 2026/);
  });
});

describe("the interactive marker", () => {
  const body = readFileSync("web/src/components/AnswerBody.tsx", "utf8");
  const css = readFileSync("web/src/app.css", "utf8");

  it("holds the highlight for five seconds", () => {
    expect(body).toMatch(/HIGHLIGHT_MS = 5_000/);
    expect(body).toMatch(/setTimeout\(\(\) => setHighlighted\(null\), HIGHLIGHT_MS\)/);
  });

  // Choosing a second marker cancels the first immediately rather than leaving
  // two highlights, or letting the first timer clear the second.
  it("cancels a running highlight before starting the next", () => {
    const reveal = /const reveal = [\s\S]*?\n  \};/.exec(body)?.[0] ?? "";
    const clearAt = reveal.indexOf("clearTimeout");
    const setAt = reveal.indexOf("setHighlighted(citationId)");
    expect(clearAt).toBeGreaterThan(-1);
    expect(clearAt).toBeLessThan(setAt);
  });

  it("clears the timer on unmount", () => {
    expect(body).toMatch(/useEffect\(\s*\(\) => \(\) => \{[\s\S]*clearTimeout/);
  });

  it("moves focus to the source, so the cue reaches keyboard and screen reader users", () => {
    expect(body).toMatch(/target\?\.focus\(/);
    expect(body).toMatch(/tabIndex=\{-1\}/);
  });

  it("gives the marker a spoken name rather than leaving it as a bracket", () => {
    expect(body).toMatch(/Show source \{number\}, \{citation\.label\}/);
    expect(body).toMatch(/aria-hidden="true">\[\{number\}\]/);
  });

  it("associates the marker with its source for assistive technology", () => {
    expect(body).toMatch(/aria-describedby=\{sourceDomId/);
  });

  // WCAG 1.4.1: the found state cannot rest on colour alone.
  it("marks the found source with more than colour", () => {
    const found = /\.citation--found \{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(found).toMatch(/border-left-color/);
    expect(found).toMatch(/font-weight/);
  });

  // The list sits inside a keylime block, so a tinted background alone barely reads.
  it("lifts the found source off its container with a ring and a cream ground", () => {
    const found = /\.citation--found \{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(found).toMatch(/box-shadow: 0 0 0 3px/);
    expect(found).toMatch(/background: var\(--color-cream-paper\)/);
  });

  it("uses a ring rather than a border so nothing reflows", () => {
    const found = /\.citation--found \{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(found).not.toMatch(/^\s*border:/m);
  });

  it("keeps the chosen marker picked out while its source is highlighted", () => {
    expect(css).toMatch(/\.cite-marker--active/);
    expect(body).toMatch(/cite-marker--active/);
  });

  it("renders a number even when the server omits one", () => {
    expect(body).toMatch(/citation\.number \?\? index \+ 1/);
  });

  it("honours reduced motion on the highlight transition", () => {
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.citation--found \{ transition: none/);
  });
});
