export interface ChunkScope {
  documentId: string;
  contractId: string;
  planId: string;
  planYear: number;
  snapshotId: string;
}

export interface CorpusChunk {
  id: string;
  documentId: string;
  kind: string;
  contractId: string;
  planId: string;
  planYear: number;
  section: string;
  content: string;
  snapshotId: string;
}

const MAX_CHARS = 2_400;

/**
 * A benefit row starts with its name in the label column, which the column
 * extractor emits ahead of the cell text on the same line.
 */
const BENEFIT_HEADING =
  /^([A-Z][A-Za-z’'()&,\- ]{2,40}?)\s+(In-Network|Out-of-Network|In-Network and Out-of-Network)[:.]?\s*$/;

const SECTION_BANNER = /^(SECTION\b.*|[A-Z][A-Z \-&]{6,})$/;

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

interface Section {
  heading: string;
  lines: string[];
}

/**
 * Naive, header-aware chunking of one plan's Summary of Benefits column. Stage 3
 * indexes this document alone; Stage 4 replaces this with the real chunker.
 */
export function chunkSummaryOfBenefits(text: string, scope: ChunkScope): CorpusChunk[] {
  const sections = splitIntoSections(text);
  const chunks: CorpusChunk[] = [];
  const used = new Map<string, number>();

  for (const section of sections) {
    const body = section.lines.join("\n").trim();
    if (body.length === 0) continue;

    for (const part of splitToSize(body, MAX_CHARS)) {
      const base = `${scope.contractId}-${scope.planId}-${scope.planYear}-${slug(section.heading)}`;
      const ordinal = (used.get(base) ?? 0) + 1;
      used.set(base, ordinal);

      chunks.push({
        id: `${base}-${String(ordinal).padStart(2, "0")}`,
        documentId: scope.documentId,
        kind: "summary_of_benefits",
        contractId: scope.contractId,
        planId: scope.planId,
        planYear: scope.planYear,
        section: section.heading,
        content: part,
        snapshotId: scope.snapshotId,
      });
    }
  }
  return chunks;
}

function splitIntoSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: "Preamble", lines: [] };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim().length === 0) continue;

    const benefit = BENEFIT_HEADING.exec(line.trim());
    if (benefit?.[1] !== undefined) {
      if (current.lines.length > 0) sections.push(current);
      current = { heading: benefit[1].trim(), lines: [line] };
      continue;
    }
    if (SECTION_BANNER.test(line.trim()) && current.lines.length > 0) {
      sections.push(current);
      current = { heading: line.trim(), lines: [line] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.length > 0) sections.push(current);
  return sections;
}

/** Split on line boundaries so a copay never lands in a different chunk from its label. */
function splitToSize(body: string, limit: number): string[] {
  if (body.length <= limit) return [body];

  const parts: string[] = [];
  let buffer: string[] = [];
  let size = 0;

  for (const line of body.split("\n")) {
    if (size + line.length + 1 > limit && buffer.length > 0) {
      parts.push(buffer.join("\n"));
      buffer = [];
      size = 0;
    }
    buffer.push(line);
    size += line.length + 1;
  }
  if (buffer.length > 0) parts.push(buffer.join("\n"));
  return parts;
}
