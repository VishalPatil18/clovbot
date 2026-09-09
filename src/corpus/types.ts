import type { PlanRef } from "../types.ts";

export type DocumentKind =
  | "evidence_of_coverage"
  | "summary_of_benefits"
  | "annual_notice_of_change"
  | "formulary"
  | "provider_directory"
  | "pharmacy_directory"
  | "corporate";

/** Keys as the document-search endpoint names them, mapped to our vocabulary. */
export const CATALOG_KEY_TO_KIND = {
  benefit_summary: "summary_of_benefits",
  evidence_of_coverage: "evidence_of_coverage",
  annual_notice_of_change: "annual_notice_of_change",
} as const satisfies Record<string, DocumentKind>;

export type Language = "english" | "spanish";

export interface Scope {
  planYear: number;
  stateAbbrev: string;
}

export interface CountyResolution {
  zipcode: string;
  fipsCountyId: string;
  countyName: string;
  stateAbbrev: string;
}

export interface CatalogPlan {
  contractId: string;
  planId: string;
  year: number;
  name: string;
  networkType: string;
  rxCoverage: boolean;
  documents: Record<string, unknown>;
}

export interface SourceDocument {
  id: string;
  kind: DocumentKind;
  url: string;
  contractId: string;
  planId: string;
  planYear: number;
  language: Language;
}

/** Never blank. A document we could not retrieve says so and says why. */
export type FetchStatus = "ok" | "failed" | "blocked" | "synthetic";

export interface ManifestEntry {
  documentId: string;
  kind: DocumentKind;
  contractId: string;
  planId: string;
  /** Which edition of the document this is. Retrieval scopes by it. */
  language: Language;
  status: FetchStatus;
  url: string;
  retrievedAt: string;
  robotsAllowed: boolean;
  bytes: number | null;
  pages: number | null;
  sha256: string | null;
  convertedBytes: number | null;
  failureReason: string | null;
}

export interface Snapshot {
  id: string;
  createdAt: string;
  countyId: string;
  planYear: number;
  /** Every plan the snapshot covers, across however many contracts. */
  plans: PlanRef[];
  entries: ManifestEntry[];
}
