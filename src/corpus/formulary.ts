import { parseBboxPages, type BboxLine, type BboxPage } from "./columns.ts";

export interface DrugRow {
  category: string;
  /** As printed, including form code and strengths. */
  name: string;
  /** Drug name alone, lowercased: what a member types. */
  normalizedName: string;
  tier: number;
  requirements: string;
}

/** Column headers on every drug-table page. Pages without one are not the table. */
const HEADER_NAME = "Drug Name";
const HEADER_TIER = "Drug Tier";

/** Dosage form codes sit between the drug name and its strengths. */
const FORM_CODE = /^[A-Z]{2,4}\d{0,2}$/;

/** A bare integer alone on the line; a digit prefix would swallow "10 mg". */
const FURNITURE = /^(PA - Prior|mail-order)\b|^\d+$/;

/** Column boundaries are read from each page's own header, never inherited. */
interface Columns {
  tierFrom: number;
  requirementsFrom: number;
  headerY: number;
}

const text = (words: BboxLine["words"]): string =>
  words
    .map((word) => word.text)
    .join(" ")
    .trim();

function findColumns(page: BboxPage): Columns | null {
  for (const line of page.lines) {
    const joined = text(line.words);
    if (!joined.includes(HEADER_NAME) || !joined.includes(HEADER_TIER)) continue;
    const tier = line.words.find((word) => word.text === "Tier");
    const requirements = line.words.find((word) => word.text.startsWith("Requirements"));
    if (tier === undefined || requirements === undefined) continue;
    // Header labels are left-aligned with their columns; back off so a value
    // sitting slightly left of its label still lands in the right column.
    return { tierFrom: tier.x - 20, requirementsFrom: requirements.x - 20, headerY: line.y };
  }
  return null;
}

/**
 * Drug name minus its form code and strengths, which is what a member types.
 * "atorvastatin calcium TABS 10mg, 20mg" becomes "atorvastatin calcium".
 */
export function normalizeDrugName(name: string): string {
  const words = name.split(/\s+/);
  const cut = words.findIndex(
    (word, index) => index > 0 && (FORM_CODE.test(word) || /\d/.test(word)),
  );
  return (cut === -1 ? words : words.slice(0, cut)).join(" ").toLowerCase().trim();
}

/**
 * Typed rows from the bounding boxes: a fact in a table wants a table query,
 * and layout text loses the wrapped half of both columns.
 */
export function parseFormulary(xhtml: string): DrugRow[] {
  const rows: DrugRow[] = [];
  let category = "";

  for (const page of parseBboxPages(xhtml)) {
    const columns = findColumns(page);
    if (columns === null) continue;

    for (const line of page.lines) {
      if (line.y <= columns.headerY) continue;
      const name = line.words.filter((word) => word.x < columns.tierFrom);
      const tierWords = line.words.filter(
        (word) => word.x >= columns.tierFrom && word.x < columns.requirementsFrom,
      );
      const requirements = line.words.filter((word) => word.x >= columns.requirementsFrom);

      const tier = tierWords.length === 1 ? Number(tierWords[0]?.text) : Number.NaN;
      if (Number.isInteger(tier) && tier >= 1 && tier <= 5) {
        const printed = text(name);
        rows.push({
          category,
          name: printed,
          normalizedName: normalizeDrugName(printed),
          tier,
          requirements: text(requirements),
        });
        continue;
      }

      const previous = rows.at(-1);
      // A line with no tier continues the row above, in whichever column it sits.
      if (requirements.length > 0 && previous !== undefined) {
        previous.requirements = `${previous.requirements} ${text(requirements)}`.trim();
      }
      if (name.length === 0 || tierWords.length > 0) continue;

      const label = text(name);
      if (FURNITURE.test(label)) continue;

      // Class headings sit left of the drug-name column. Letter case is not the
      // signal: "ANTILIPEMICS, HMG-CoA REDUCTASE INHIBITORS" is a heading.
      const startsLeftOfNames = (name[0]?.x ?? Number.POSITIVE_INFINITY) < columns.tierFrom - 260;
      if (startsLeftOfNames) {
        category = label;
        continue;
      }
      if (previous !== undefined) previous.name = `${previous.name} ${label}`.trim();
    }
  }

  for (const row of rows) row.normalizedName = normalizeDrugName(row.name);
  return rows;
}
