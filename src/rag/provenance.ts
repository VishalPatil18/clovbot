import type { DocumentKind, Provenance } from "../types.ts";

const DOCUMENT_KINDS: DocumentKind[] = [
  "evidence_of_coverage",
  "summary_of_benefits",
  "annual_notice_of_change",
  "formulary",
  "provider_directory",
  "pharmacy_directory",
  "corporate",
];

/** Documents that cover the whole contract rather than one plan benefit package. */
export const ALL_PLANS = "*";

/** Documents that cover every contract, such as the formulary and corporate pages. */
export const ALL_CONTRACTS = "*";

/**
 * Whether a row belongs to the session's plan. Wildcards answer everywhere by
 * design; anything else leaks as a confidently wrong copay, not as an error.
 */
export function isInPlanScope(
  scope: { contractId: string; planId: string; planYear: number },
  row: { contractId: string; planId: string; planYear: number },
): boolean {
  if (row.planYear !== scope.planYear) return false;
  const contractOk = row.contractId === scope.contractId || row.contractId === ALL_CONTRACTS;
  const planOk = row.planId === scope.planId || row.planId === ALL_PLANS;
  return contractOk && planOk;
}

/**
 * Raises rather than defaulting. A citation missing plan year or plan is not a
 * citation, so a chunk that cannot state its provenance must never be indexed.
  */
export function buildProvenance(raw: Record<string, unknown>): Provenance {
  const document = raw["document"];
  if (typeof document !== "string" || !DOCUMENT_KINDS.includes(document as DocumentKind)) {
    throw new Error(`provenance: unknown document kind ${JSON.stringify(document)}`);
  }

  const planYear = raw["planYear"];
  if (typeof planYear !== "number" || !Number.isInteger(planYear)) {
    throw new Error("provenance: plan year is missing or not a whole number");
  }

  const contractId = raw["contractId"];
  if (typeof contractId !== "string" || contractId.length === 0) {
    throw new Error("provenance: contract id is missing");
  }

  const planId = raw["planId"];
  if (typeof planId !== "string" || planId.length === 0) {
    throw new Error("provenance: plan id is missing");
  }

  const section = raw["section"];
  if (typeof section !== "string" || section.length === 0) {
    throw new Error("provenance: section is missing");
  }

  return { document: document as DocumentKind, planYear, contractId, planId, section };
}

/** Out-of-year documents are rejected at ingest, never filtered at query time. */
export function isAllowedPlanYear(year: unknown, configured: number): boolean {
  return typeof year === "number" && Number.isInteger(year) && year === configured;
}
