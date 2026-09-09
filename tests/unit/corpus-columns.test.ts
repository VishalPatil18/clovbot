import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractPlanColumn, parseBboxPages } from "../../src/corpus/columns.ts";

const fixture = (name: string): string =>
  readFileSync(`tests/fixtures/corpus/live/${name}`, "utf8");

const BENEFITS_PAGE = fixture("sob-page4.bbox.xhtml");
const COVER_PAGE = fixture("sob-page1.bbox.xhtml");
const FULL_DOCUMENT = fixture("sob-full.bbox.xhtml");

describe("parseBboxPages", () => {
  it("reads words with their coordinates", () => {
    const [page] = parseBboxPages(BENEFITS_PAGE);
    expect(page?.words.length).toBeGreaterThan(100);
    expect(page?.words[0]).toMatchObject({ text: "SECTION" });
  });

  it("groups words onto lines by their vertical position", () => {
    const [page] = parseBboxPages(BENEFITS_PAGE);
    const specialistLine = page?.lines.find((l) => l.words.some((w) => w.text === "$10"));
    expect(specialistLine?.words.map((w) => w.text)).toEqual([
      "Specialist", "visit:", "$10", "copay",
      "Specialist", "visit:", "$2", "copay",
    ]);
  });

  it("reads the whole 16-page document", () => {
    expect(parseBboxPages(FULL_DOCUMENT)).toHaveLength(16);
  });
});

describe("extractPlanColumn", () => {
  it("keeps only the requested plan's amounts", () => {
    const text = extractPlanColumn(BENEFITS_PAGE, "004");
    expect(text).toContain("Specialist visit: $10 copay");
    expect(text).not.toContain("$2 copay");
  });

  it("keeps the benefit label attached to the row", () => {
    const text = extractPlanColumn(BENEFITS_PAGE, "004");
    expect(text).toMatch(/Doctor’s Office/);
    expect(text).toMatch(/Inpatient Hospital\s+In-Network:/);
  });

  it("drops every amount belonging to the other plan", () => {
    const text = extractPlanColumn(BENEFITS_PAGE, "004");
    // 007's distinct amounts on this page: $250 outpatient surgery, $175 ASC, $2 specialist.
    expect(text).not.toContain("$175");
    expect(text).not.toContain("$2 copay");
    expect(text).toContain("$350");
    expect(text).toContain("$275");
  });

  it("passes a single-column page through untouched", () => {
    const text = extractPlanColumn(COVER_PAGE, "004");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/Summary of Benefits/i);
  });

  it("converts the whole document", () => {
    const text = extractPlanColumn(FULL_DOCUMENT, "004");
    expect(text.length).toBeGreaterThan(5_000);
    expect(text).toContain("Specialist visit: $10 copay");
  });

  // Page 15's rewards table repeats the layout but not the "(Plan NNN)" header.
  it("inherits the column boundary on a page whose header is missing", () => {
    const text = extractPlanColumn(FULL_DOCUMENT, "004");
    const rewards = text.split("\n").filter((l) => l.includes("$400"));
    expect(rewards.length).toBeGreaterThan(0);
    // The amount appears once per row, not once per plan column.
    for (const line of rewards) expect(line.match(/\$400/g)).toHaveLength(1);
  });

  // The same page runs full-width disclaimer prose below that table.
  it("does not cut full-width prose at the column boundary", () => {
    const text = extractPlanColumn(FULL_DOCUMENT, "004");
    expect(text).toContain("Enrollment in Clover Health");
    expect(text).toContain("depends on");
    expect(text).toMatch(/language assistance services, free of charge, are available/);
  });

  // A page that cannot be attributed must fail, never emit unattributed amounts.
  it("throws when the document carries no plan header at all", () => {
    const headerless = FULL_DOCUMENT.replace(/\(Plan/g, "XXXXX");
    expect(() => extractPlanColumn(headerless, "004")).toThrow(/no plan header/i);
  });

  it("throws when the requested plan is not one of the columns", () => {
    expect(() => extractPlanColumn(FULL_DOCUMENT, "999")).toThrow(/999/);
  });

  it("throws when the document carries no plan header at all", () => {
    const headerless = FULL_DOCUMENT.replace(/\(Plan/g, "XXXXX");
    expect(() => extractPlanColumn(headerless, "007")).toThrow(/no plan header/i);
  });
});

// Plan 007 is the right-hand column, and the benefit-label column sits on
// the far side of plan 004's column rather than adjacent to it.
describe("extractPlanColumn, right-hand column", () => {
  it("keeps only the right plan's amounts", () => {
    const text = extractPlanColumn(BENEFITS_PAGE, "007");
    expect(text).toContain("Specialist visit: $2 copay");
    expect(text).not.toContain("$10 copay");
  });

  it("drops every amount belonging to the left plan", () => {
    const text = extractPlanColumn(BENEFITS_PAGE, "007");
    // 004's distinct amounts on this page: $350 and $500 outpatient surgery
    // $275 ambulatory surgery, $10 and $20 specialist.
    expect(text).not.toContain("$275");
    expect(text).not.toContain("$500");
    // 007's own amounts survive.
    expect(text).toContain("$250");
    expect(text).toContain("$175");
  });

  it("still attaches the benefit label from the far-left column", () => {
    const text = extractPlanColumn(BENEFITS_PAGE, "007");
    expect(text).toMatch(/Doctor’s Office/);
    expect(text).toMatch(/Inpatient Hospital\s+In-Network:/);
  });

  it("keeps the right plan's own header and drops the left one", () => {
    const text = extractPlanColumn(BENEFITS_PAGE, "007");
    expect(text).toContain("(Plan 007)");
    expect(text).not.toContain("(Plan 004)");
  });

  it("converts the whole document", () => {
    const text = extractPlanColumn(FULL_DOCUMENT, "007");
    expect(text.length).toBeGreaterThan(5_000);
    expect(text).toContain("Specialist visit: $2 copay");
  });

  it("does not cut full-width prose at a column boundary", () => {
    const text = extractPlanColumn(FULL_DOCUMENT, "007");
    expect(text).toContain("Enrollment in Clover Health");
    expect(text).toMatch(/language assistance services, free of charge, are available/);
  });

  it("gives the two plans different specialist copays from the same document", () => {
    const left = extractPlanColumn(FULL_DOCUMENT, "004");
    const right = extractPlanColumn(FULL_DOCUMENT, "007");
    expect(left).toContain("Specialist visit: $10 copay");
    expect(right).toContain("Specialist visit: $2 copay");
    expect(left).not.toEqual(right);
  });
});

describe("column geometry is per page, not inherited [D-057]", () => {
  const hmo = readFileSync("tests/fixtures/corpus/live/h8010-sob-pages10-11.bbox.xhtml", "utf8");

  // A headerless table on alternating margins: page 10's absolute gutter cuts
  // a word in half on page 11.
  it("converts a headerless table page whose margins differ from the page above", () => {
    expect(() => extractPlanColumn(hmo, "002")).not.toThrow();
    expect(() => extractPlanColumn(hmo, "003")).not.toThrow();
  });

  it("keeps each plan's column separate on the headerless page", () => {
    const left = extractPlanColumn(hmo, "002");
    const right = extractPlanColumn(hmo, "003");
    expect(left).toContain("$400 a year in LiveHealthy");
    expect(right).toContain("$400 a year in LiveHealthy");
    // Amounts belonging only to 002 must not bleed into 003's column.
    expect(left).toContain("$135 copay");
    expect(right).not.toContain("$135 copay");
  });

  // A table before any header cannot be attributed to plans the document has not
  // introduced. Inheriting forward would guess; failing loudly is the rule.
  it("refuses a two-column money table appearing before the first header page", () => {
    const money = (y: number): string =>
      `<word xMin="60" yMin="${y}" xMax="90" yMax="${y + 8}">$10</word>` +
      `<word xMin="400" yMin="${y}" xMax="430" yMax="${y + 8}">$20</word>` +
      `<word xMin="200" yMin="${y}" xMax="300" yMax="${y + 8}">spanning</word>`;
    const header = (y: number): string =>
      `<word xMin="100" yMin="${y}" xMax="140" yMax="${y + 8}">(Plan</word>` +
      `<word xMin="145" yMin="${y}" xMax="180" yMax="${y + 8}">004)</word>` +
      `<word xMin="400" yMin="${y}" xMax="440" yMax="${y + 8}">(Plan</word>` +
      `<word xMin="445" yMin="${y}" xMax="480" yMax="${y + 8}">007)</word>`;
    const doc = `<page a="1">${money(100)}</page><page a="2">${header(50)}${money(100)}</page>`;
    expect(() => extractPlanColumn(doc, "004")).toThrow(/no plan header anywhere|cannot be attributed/);
  });
});
