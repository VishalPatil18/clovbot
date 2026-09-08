import { execFileSync } from "node:child_process";
import type { DocumentKind } from "./types.ts";
import { extractPlanColumn } from "./columns.ts";

/**
 * Minimum converted size per kind, set well below what the real 2026 documents
 * produce. These catch a conversion that reported success and emitted nothing,
 * which is the failure that looks like a pass.
 */
export const BYTE_FLOORS = {
  evidence_of_coverage: 100_000,
  summary_of_benefits: 5_000,
  annual_notice_of_change: 5_000,
  formulary: 50_000,
  pharmacy_directory: 20_000,
  provider_directory: 1_000,
  corporate: 500,
} as const satisfies Record<DocumentKind, number>;

export function meetsByteFloor(kind: DocumentKind, bytes: number): boolean {
  return bytes >= BYTE_FLOORS[kind];
}

const CONTENT_REGION = /<[a-z]+[^>]*\bid="content"[^>]*>([\s\S]*)$/i;
const BODY_REGION = /<body[^>]*>([\s\S]*?)<\/body>/i;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&rsquo;": "’",
  "&nbsp;": " ",
};

/** Plain text from a Clover page. Prose only, so markdown structure buys nothing. */
export function extractHtmlText(html: string): string {
  const scoped = CONTENT_REGION.exec(html)?.[1] ?? BODY_REGION.exec(html)?.[1] ?? html;

  return scoped
    .replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(p|div|h[1-6]|li|tr|br)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function pdfToText(path: string): string {
  return execFileSync("pdftotext", ["-layout", path, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** The Summary of Benefits is a two-plan comparison, so it needs coordinates. D-031. */
export function pdfToPlanColumn(path: string, planId: string): string {
  const xhtml = execFileSync("pdftotext", ["-bbox-layout", path, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return extractPlanColumn(xhtml, planId);
}

export function pdfPageCount(path: string): number | null {
  const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
  const pages = /^Pages:\s+(\d+)$/m.exec(info)?.[1];
  return pages === undefined ? null : Number(pages);
}
