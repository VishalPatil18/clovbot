import type { DocumentKind } from "../types.ts";
import type { Language } from "../corpus/types.ts";

export interface ChunkInput {
  text: string;
  kind: DocumentKind;
  documentId: string;
  contractId: string;
  planId: string;
  planYear: number;
  snapshotId: string;
  /** Retrieval scopes by it, so it travels with the chunk rather than the document. */
  language: Language;
}

export interface CorpusChunk {
  id: string;
  documentId: string;
  kind: DocumentKind;
  contractId: string;
  planId: string;
  planYear: number;
  section: string;
  content: string;
  /** D-006. Prepended before embedding and lexical indexing, not shown to members. */
  contextPrefix: string;
  embedText: string;
  language: Language;
  /** True when no heading was available, so the prefix has to be generated. */
  needsGeneratedContext: boolean;
  snapshotId: string;
}

const MAX_CHARS = 2_400;
/**
 * Web pages carry dialog and button text ("Cancel", "Continue") that survives
 * extraction and reads as a heading. PDFs have real structure, so the floor
 * applies only where the furniture is.
 */
const MIN_CORPORATE_CHARS = 80;
const NO_SECTION = "Unlabelled";

/** Table-of-contents lines carry dot leaders and a page number. Never headings. */
const TOC_LINE = /\.{4,}\s*\d+\s*$/;

/** In the body a chapter line is bare and its title sits on the next line. */
const EOC_CHAPTER_BARE = /^\s*CHAPTER\s+\d+\s*:\s*$/;
const EOC_CHAPTER = /^\s*CHAPTER\s+\d+\s*[:.]?\s*(.+?)\s*$/;
const EOC_SECTION = /^\s*SECTION\s+\d+(?:\.\d+)?\s+(.+?)\s*$/;
const EOC_SUBSECTION = /^\s*Section\s+\d+\.\d+\s+(.+?)\s*$/;

/**
 * A therapeutic class heading. Mostly uppercase, but not entirely: "HMG-CoA" and
 * "(DMARDS)" are real headings, and requiring every character to be uppercase
 * silently indexed ten statins under the class above them. D-059.
 */
const FORMULARY_CLASS = /^(\s*)([A-Z][A-Za-z0-9 &,'/()-]{5,})\s*$/;

/** A drug row carries a tier digit in its own column; a class heading never does. */
const FORMULARY_ROW = /\s{2,}[1-5](\s|$)/;

const SOB_BENEFIT =
  /^([A-Z][A-Za-z’'()&,\- ]{2,40}?)\s+(In-Network|Out-of-Network|In-Network and Out-of-Network)[:.]?\s*$/;
const SOB_BANNER = /^(SECTION\b.*|[A-Z][A-Z \-&]{6,})$/;

interface Heading {
  level: number;
  title: string;
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

function detectHeading(line: string, kind: DocumentKind): Heading | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || TOC_LINE.test(trimmed)) return null;

  if (kind === "evidence_of_coverage" || kind === "annual_notice_of_change") {
    const chapter = EOC_CHAPTER.exec(trimmed);
    if (chapter?.[1] !== undefined) return { level: 1, title: `Chapter: ${chapter[1]}` };
    const section = EOC_SECTION.exec(trimmed) ?? EOC_SUBSECTION.exec(trimmed);
    if (section?.[1] !== undefined) return { level: 2, title: section[1] };
    return null;
  }

  if (kind === "formulary") {
    if (FORMULARY_ROW.test(line)) return null;
    const klass = FORMULARY_CLASS.exec(line);
    if (klass?.[2] !== undefined) {
      const indent = (klass[1] ?? "").length;
      return { level: indent === 0 ? 1 : 2, title: klass[2].trim() };
    }
    return null;
  }

  if (kind === "summary_of_benefits") {
    const benefit = SOB_BENEFIT.exec(trimmed);
    if (benefit?.[1] !== undefined) return { level: 2, title: benefit[1].trim() };
    if (SOB_BANNER.test(trimmed)) return { level: 1, title: trimmed };
    return null;
  }

  // Corporate prose: a short line with no sentence punctuation reads as a heading.
  if (trimmed.length <= 80 && !/[.!?:,]$/.test(trimmed) && /^[A-Z]/.test(trimmed)) {
    return { level: 1, title: trimmed };
  }
  return null;
}

interface Section {
  path: string[];
  lines: string[];
}

function splitIntoSections(text: string, kind: DocumentKind): Section[] {
  const sections: Section[] = [];
  const path: string[] = [];
  let current: Section = { path: [], lines: [] };

  const flush = (): void => {
    if (current.lines.some((line) => line.trim().length > 0)) sections.push(current);
  };

  const lines = text.split("\n");
  // The Evidence of Coverage opens with a table of contents whose entries look
  // exactly like headings. The body starts at the first bare "CHAPTER n:" line,
  // so nothing before that is treated as a heading.
  const chaptered = kind === "evidence_of_coverage" || kind === "annual_notice_of_change";
  const bodyStart = chaptered ? lines.findIndex((line) => EOC_CHAPTER_BARE.test(line)) : 0;

  for (const [index, raw] of lines.entries()) {
    if (raw.trim().length === 0) continue;

    const heading = index < bodyStart ? null : detectHeading(raw, kind);
    if (heading === null) {
      current.lines.push(raw.trimEnd());
      continue;
    }

    // A bare chapter line carries its title on the following line.
    let title = heading.title;
    if (chaptered && EOC_CHAPTER_BARE.test(raw)) {
      const next = lines.slice(index + 1).find((line) => line.trim().length > 0);
      title = next === undefined ? title : `Chapter: ${next.trim()}`;
    }

    flush();
    path.length = Math.min(path.length, heading.level - 1);
    path[heading.level - 1] = title;
    current = { path: path.filter((part) => part !== undefined), lines: [raw.trimEnd()] };
  }
  flush();
  return sections;
}

/** Split on line boundaries so an amount never parts company with its label. */
function splitToSize(lines: string[], limit: number): string[] {
  const parts: string[] = [];
  let buffer: string[] = [];
  let size = 0;

  for (const line of lines) {
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

const KIND_LABEL: Record<DocumentKind, string> = {
  evidence_of_coverage: "Evidence of Coverage",
  summary_of_benefits: "Summary of Benefits",
  annual_notice_of_change: "Annual Notice of Change",
  formulary: "Formulary",
  provider_directory: "Provider Directory",
  pharmacy_directory: "Pharmacy Directory",
  corporate: "Clover Health public information",
};

/**
 * Header-aware chunking across every document kind. The contextual prefix is
 * derived from the heading path rather than generated, because the headings
 * already carry what D-006 wants; only chunks with no heading need the model.
 */
export function chunkDocument(input: ChunkInput): CorpusChunk[] {
  const chunks: CorpusChunk[] = [];
  const used = new Map<string, number>();

  for (const section of splitIntoSections(input.text, input.kind)) {
    const path = section.path.filter((part) => part.length > 0);
    const sectionName = path.length > 0 ? path.join(" > ") : NO_SECTION;

    for (const content of splitToSize(section.lines, MAX_CHARS)) {
      const body = content.trim();
      if (body.length === 0) continue;
      if (input.kind === "corporate" && body.length < MIN_CORPORATE_CHARS) continue;

      // The document must be part of the id: two pages can share a heading, and
      // without it their chunks collide and one silently overwrites the other.
      const base = `${input.documentId}-${slug(sectionName)}`;
      const ordinal = (used.get(base) ?? 0) + 1;
      used.set(base, ordinal);

      const contextPrefix =
        `${KIND_LABEL[input.kind]}, ${input.contractId}-${input.planId}, plan year ` +
        `${input.planYear}. ${path.length > 0 ? path.join(", ") : KIND_LABEL[input.kind]}.`;

      chunks.push({
        id: `${base}-${String(ordinal).padStart(3, "0")}`,
        documentId: input.documentId,
        kind: input.kind,
        contractId: input.contractId,
        planId: input.planId,
        planYear: input.planYear,
        section: sectionName,
        content,
        contextPrefix,
        embedText: `${contextPrefix}\n\n${content}`,
        needsGeneratedContext: path.length === 0,
        snapshotId: input.snapshotId,
        language: input.language,
      });
    }
  }
  return chunks;
}
