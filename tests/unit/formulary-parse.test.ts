import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFormulary } from "../../src/corpus/formulary.ts";

const fixture = readFileSync("tests/fixtures/corpus/live/formulary-pages36-37.bbox.xhtml", "utf8");
const rows = parseFormulary(fixture);
const find = (prefix: string) => rows.find((row) => row.name.startsWith(prefix));

describe("parseFormulary [FR-P2-07, D-058]", () => {
  it("reads drug rows from the table pages", () => {
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) {
      expect(row.tier).toBeGreaterThanOrEqual(1);
      expect(row.tier).toBeLessThanOrEqual(5);
      expect(row.name.length).toBeGreaterThan(0);
    }
  });

  // This fixture starts mid-class, so its first row continues a heading on the
  // page before it. Every row after a heading is seen must carry one.
  it("attributes every row once a class heading has appeared", () => {
    const first = rows.findIndex((row) => row.category.length > 0);
    expect(first).toBeGreaterThanOrEqual(0);
    for (const row of rows.slice(first)) expect(row.category.length).toBeGreaterThan(0);
  });

  // Strengths wrap onto a second line. Dropping it truncates the dosage list.
  it("joins a name that wraps onto the next line", () => {
    expect(find("atorvastatin")?.name).toBe("atorvastatin calcium TABS 10mg, 20mg, 40mg, 80mg");
  });

  // Requirements wrap too, and dropping the tail loses step therapy entirely -
  // the drug would read as carrying a quantity limit only.
  it("joins requirements that wrap onto the next line", () => {
    expect(find("EZALLOR")?.requirements).toBe("QL (30 caps / 30 days), ST");
    expect(find("fluvastatin sodium CAPS")?.requirements).toBe("QL (60 caps / 30 days), ST");
  });

  // The heading carries a lowercase letter, so a letter-case rule misses it and
  // every statin silently inherits the class above. D-059.
  it("assigns the class whose heading is not all uppercase", () => {
    expect(find("atorvastatin")?.category).toBe("ANTILIPEMICS, HMG-CoA REDUCTASE INHIBITORS");
    expect(find("lovastatin")?.category).toBe("ANTILIPEMICS, HMG-CoA REDUCTASE INHIBITORS");
  });

  it("reads the tier as a number", () => {
    expect(find("atorvastatin")?.tier).toBe(1);
    expect(find("EZALLOR")?.tier).toBe(4);
  });

  it("leaves requirements empty rather than null when a drug has none", () => {
    const plain = rows.find((row) => row.requirements === "");
    expect(plain).toBeDefined();
  });

  it("drops page furniture rather than reading it as a drug", () => {
    for (const row of rows) {
      expect(row.name).not.toMatch(/Prior Authorization|mail-order|Drug Name/);
    }
  });

  it("normalizes a name to what a member would type", () => {
    expect(find("atorvastatin")?.normalizedName).toBe("atorvastatin calcium");
    expect(find("EZALLOR")?.normalizedName).toBe("ezallor sprinkle");
  });
});

describe("continuation lines that begin with a digit", () => {
  // "10 mg" is a strength, not a page number. Treating a digit prefix as page
  // furniture collapsed three distinct strengths of the same drug into one row.
  it("keeps a strength continuation that starts with a number", () => {
    const combos = rows.filter((row) => row.normalizedName.includes("valsartan-hydrochlorothiazide"));
    for (const row of combos) expect(row.name).toMatch(/\d/);
  });

  it("produces no two rows with an identical printed name", () => {
    const names = rows.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
