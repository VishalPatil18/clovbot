import type { Block, BlockKind } from "./transcript.ts";
import type { Speech } from "./api.ts";
import { s } from "./strings.ts";

/** Points. US Letter, because the audience is American and prints on it. */
const PAGE = { width: 612, height: 792, margin: 56 };
const FOOTER = 32;

/**
 * One entry per kind: size, weight, the space above it, and how far it is
 * indented. Type is the only structure a text-only PDF has.
 */
const STYLE: Record<BlockKind, { size: number; bold: boolean; before: number; indent: number }> = {
  title: { size: 18, bold: true, before: 0, indent: 0 },
  meta: { size: 10, bold: false, before: 5, indent: 0 },
  notice: { size: 12, bold: true, before: 16, indent: 0 },
  question: { size: 14, bold: true, before: 24, indent: 0 },
  body: { size: 13, bold: false, before: 11, indent: 0 },
  label: { size: 11, bold: true, before: 14, indent: 0 },
  item: { size: 10.5, bold: false, before: 5, indent: 16 },
};

/**
 * The reading surface is 18px at 1.6 on screen, and this audience is why. The
 * body here is its equivalent in points rather than the 11pt a document would
 * normally set, and the leading follows.
 */
const LEADING = 1.4;

/**
 * Sets the document model as a PDF. FR-P3-70.
 *
 * Text only: an HTML-to-canvas rasteriser would produce a large file of
 * unselectable pixels, which a screen reader cannot read and a member cannot
 * copy an amount out of. Helvetica is one of the fourteen fonts every reader
 * carries, so nothing is embedded and Spanish accents still set correctly.
 */
export async function renderTranscript(blocks: readonly Block[], language: Speech): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = PAGE.width - PAGE.margin * 2;
  const bottom = PAGE.height - PAGE.margin - FOOTER;
  let y = PAGE.margin;

  for (const block of blocks) {
    const style = STYLE[block.kind];
    doc.setFont("helvetica", style.bold ? "bold" : "normal");
    doc.setFontSize(style.size);
    const lines: string[] = doc.splitTextToSize(block.text, width - style.indent);
    const step = style.size * LEADING;

    // A question alone at the foot of a page reads as an unanswered one, so it
    // takes its first line of answer with it.
    const needed = style.before + step * (block.kind === "question" ? lines.length + 1 : 1);
    if (y + needed > bottom) {
      doc.addPage();
      y = PAGE.margin;
    } else {
      y += style.before;
    }

    for (const line of lines) {
      if (y + step > bottom) {
        doc.addPage();
        y = PAGE.margin;
      }
      doc.text(line, PAGE.margin + style.indent, y + style.size);
      y += step;
    }
  }

  const total = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    const label = s("pageOf", language).replace("$1", String(page)).replace("$2", String(total));
    doc.text(label, PAGE.width / 2, PAGE.height - PAGE.margin, { align: "center" });
  }

  return doc.output("arraybuffer");
}
