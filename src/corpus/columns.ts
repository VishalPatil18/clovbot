export interface BboxWord {
  text: string;
  x: number;
  x2: number;
  y: number;
}

export interface BboxLine {
  y: number;
  words: BboxWord[];
}

export interface BboxPage {
  words: BboxWord[];
  lines: BboxLine[];
}

const WORD = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g;
const PLAN_HEADER = /^(\d{3})\)$/;
const MONEY = /^\$[\d,]/;

/** Words within this many points of each other sit on the same visual row. */
const LINE_TOLERANCE = 2;

const decode = (raw: string): string =>
  raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

export function parseBboxPages(xhtml: string): BboxPage[] {
  return xhtml
    .split("<page ")
    .slice(1)
    .map((page) => {
      const words: BboxWord[] = [];
      for (const match of page.matchAll(WORD)) {
        const text = decode(match[4] ?? "");
        if (text.length === 0) continue;
        words.push({ text, x: Number(match[1]), y: Number(match[2]), x2: Number(match[3]) });
      }
      return { words, lines: groupIntoLines(words) };
    });
}

function groupIntoLines(words: BboxWord[]): BboxLine[] {
  const lines: BboxLine[] = [];
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = lines.at(-1);
    if (last !== undefined && Math.abs(word.y - last.y) <= LINE_TOLERANCE) {
      last.words.push(word);
      continue;
    }
    lines.push({ y: word.y, words: [word] });
  }
  for (const line of lines) line.words.sort((a, b) => a.x - b.x);
  return lines;
}

interface PlanColumns {
  leftPlanId: string;
  rightPlanId: string;
  /** Gutter between the benefit-label column and the left plan's column. */
  labelBoundary: number;
  /** Gutter between the two plans' columns. */
  boundary: number;
}

/** Header words read "(Plan" "004)", so the plan id is the token after "(Plan". */
function findPlanColumns(page: BboxPage): PlanColumns | null {
  const headers: { planId: string; x: number }[] = [];
  for (const line of page.lines) {
    for (const [index, word] of line.words.entries()) {
      if (word.text !== "(Plan") continue;
      const match = PLAN_HEADER.exec(line.words[index + 1]?.text ?? "");
      if (match?.[1] !== undefined) headers.push({ planId: match[1], x: word.x });
    }
  }
  const [left, right] = [...headers].sort((a, b) => a.x - b.x);
  if (left === undefined || right === undefined) return null;
  const pageLeftEdge = Math.min(...page.words.map((w) => w.x));
  return {
    leftPlanId: left.planId,
    rightPlanId: right.planId,
    labelBoundary: findGutter(page.words, pageLeftEdge, left.x),
    boundary: findGutter(page.words, left.x, right.x),
  };
}

/**
 * The column break is the gutter between the two columns, not the midpoint between
 * the headers: headers are centred in their column, so their midpoint lands inside
 * the left column's text. The gutter is the x that the fewest words cross.
 */
function findGutter(words: BboxWord[], lo: number, hi: number): number {
  const midpoint = (lo + hi) / 2;
  const candidates = new Set<number>([midpoint]);
  for (const word of words) {
    if (word.x > lo && word.x < hi) candidates.add(word.x);
    if (word.x2 > lo && word.x2 < hi) candidates.add(word.x2);
  }

  let best = midpoint;
  let bestCrossings = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  // ponytail: O(words x candidates) per page, a few tens of thousands of
  // comparisons. Sort into a sweep if a document ever makes this matter.
  for (const candidate of candidates) {
    const crossings = words.filter((w) => w.x < candidate && candidate < w.x2).length;
    const distance = Math.abs(candidate - midpoint);
    if (crossings < bestCrossings || (crossings === bestCrossings && distance < bestDistance)) {
      best = candidate;
      bestCrossings = crossings;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Emits one plan's column from a side-by-side Summary of Benefits.
 *
 * Column geometry is learned from the pages that carry a "(Plan NNN)" header and
 * inherited by pages that do not, because the layout repeats but the header does
 * not. Splitting is decided per line, not per page: a page can mix a comparison
 * table with full-width prose, and cutting the prose at the column boundary would
 * silently drop half of every sentence.
 */
export function extractPlanColumn(xhtml: string, planId: string): string {
  const pages = parseBboxPages(xhtml);
  const columnsPerPage = pages.map(findPlanColumns);
  const known = columnsPerPage.filter((c): c is PlanColumns => c !== null);

  if (known.length > 0) {
    const seen = new Set(known.flatMap((c) => [c.leftPlanId, c.rightPlanId]));
    if (!seen.has(planId)) {
      throw new Error(
        `summary of benefits: plan ${planId} is not a column in this document; ` +
          `found ${[...seen].sort().join(", ")}`,
      );
    }
  }

  return pages
    .map((page, index) => renderPage(page, nearestColumns(columnsPerPage, index), planId))
    .filter((text) => text.length > 0)
    .join("\n\n");
}

/** Nearest page carrying a header, preferring the one before this page. */
function nearestColumns(columnsPerPage: (PlanColumns | null)[], index: number): PlanColumns | null {
  for (let offset = 0; offset < columnsPerPage.length; offset += 1) {
    const before = columnsPerPage[index - offset];
    if (before != null) return before;
    const after = columnsPerPage[index + offset];
    if (after != null) return after;
  }
  return null;
}

function renderPage(page: BboxPage, columns: PlanColumns | null, planId: string): string {
  const rendered = page.lines.map((line) => renderLine(line, columns, planId));
  return rendered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderLine(line: BboxLine, columns: PlanColumns | null, planId: string): string {
  const whole = line.words.map((w) => w.text).join(" ");
  if (columns === null) {
    if (hasMoneyOnBothSides(line, pageAgnosticCentre(line))) {
      throw new Error(
        "summary of benefits: no plan header anywhere in the document, so amounts " +
          "in two columns cannot be attributed to a plan",
      );
    }
    return whole;
  }

  const { boundary, labelBoundary, rightPlanId } = columns;
  const straddles = line.words.some((w) => w.x < boundary && w.x2 > boundary);
  const left = line.words.filter((w) => w.x2 <= boundary);
  const right = line.words.filter((w) => w.x >= boundary);

  if (straddles) {
    // A word crossing the boundary means prose running the page width, not a table.
    // Unless there is money either side, in which case the line is genuinely ambiguous.
    if (hasMoneyOnBothSides(line, boundary)) {
      throw new Error(
        `summary of benefits: line at y=${line.y} has amounts on both sides of the ` +
          "column boundary and a word crossing it, so it cannot be attributed",
      );
    }
    return whole;
  }

  if (left.length === 0 || right.length === 0) return whole;

  // The benefit label sits left of both plan columns, so the left plan gets it for
  // free and the right plan has to reach across the left plan's column for it.
  const kept =
    planId === rightPlanId ? [...left.filter((w) => w.x2 <= labelBoundary), ...right] : left;
  return kept.map((w) => w.text).join(" ");
}

function hasMoneyOnBothSides(line: BboxLine, boundary: number): boolean {
  return (
    line.words.some((w) => MONEY.test(w.text) && w.x2 <= boundary) &&
    line.words.some((w) => MONEY.test(w.text) && w.x >= boundary)
  );
}

function pageAgnosticCentre(line: BboxLine): number {
  const xs = line.words.flatMap((w) => [w.x, w.x2]);
  return xs.length === 0 ? 0 : (Math.min(...xs) + Math.max(...xs)) / 2;
}
