import { describe, expect, it } from "vitest";
import { BYTE_FLOORS, extractHtmlText, meetsByteFloor } from "../../src/corpus/convert.ts";

describe("extractHtmlText", () => {
  const page = `
    <html><head><title>x</title><style>.a{color:red}</style></head>
    <body>
      <nav>Skip me</nav>
      <div id="content">
        <h2>About Clover</h2>
        <p>Clover Health is a <b>Medicare Advantage</b> company.</p>
        <script>var a = 1;</script>
        <p>Second paragraph &amp; an entity.</p>
      </div>
      <footer>Also skip</footer>
    </body></html>`;

  it("takes only the content region", () => {
    const text = extractHtmlText(page);
    expect(text).toContain("About Clover");
    expect(text).not.toContain("Skip me");
    expect(text).not.toContain("Also skip");
  });

  it("drops script and style bodies", () => {
    const text = extractHtmlText(page);
    expect(text).not.toContain("var a = 1");
    expect(text).not.toContain("color:red");
  });

  it("decodes entities", () => {
    expect(extractHtmlText(page)).toContain("Second paragraph & an entity.");
  });

  it("keeps inline emphasis as plain words rather than splitting them", () => {
    expect(extractHtmlText(page)).toMatch(/Clover Health is a Medicare Advantage company\./);
  });

  it("falls back to the whole body when there is no content region", () => {
    const text = extractHtmlText("<html><body><p>Only this</p></body></html>");
    expect(text).toContain("Only this");
  });

  it("collapses runs of blank lines", () => {
    expect(extractHtmlText(page)).not.toMatch(/\n{3,}/);
  });
});

describe("meetsByteFloor", () => {
  it("has a floor for every document kind it converts", () => {
    for (const kind of ["evidence_of_coverage", "summary_of_benefits", "formulary"] as const) {
      expect(BYTE_FLOORS[kind]).toBeGreaterThan(0);
    }
  });

  // The failure this catches is a conversion that "succeeded" and produced nothing.
  it("rejects an empty conversion", () => {
    expect(meetsByteFloor("evidence_of_coverage", 0)).toBe(false);
  });

  it("rejects a conversion far below the floor", () => {
    expect(meetsByteFloor("evidence_of_coverage", 200)).toBe(false);
  });

  it("accepts a conversion at the floor", () => {
    expect(meetsByteFloor("evidence_of_coverage", BYTE_FLOORS.evidence_of_coverage)).toBe(true);
  });

  it("holds a 199-page EOC to a higher floor than a 16-page summary", () => {
    expect(BYTE_FLOORS.evidence_of_coverage).toBeGreaterThan(BYTE_FLOORS.summary_of_benefits);
  });
});
