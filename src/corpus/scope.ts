import type { PlanRef } from "../types.ts";

export interface CorpusScope {
  countyId: string;
  zipcode: string;
  countyName: string;
  stateAbbrev: string;
  planYear: number;
  plans: PlanRef[];
}

/**
 * What the corpus covers. One definition, imported by the corpus commands, ingest,
 * the API and the eval harness, which previously disagreed across module constants
 * and three CORPUS_* environment variables. Adding a plan is one record. D-053.
 */
export const CORPUS_SCOPE: CorpusScope = {
  countyId: "34017",
  zipcode: "07302",
  countyName: "Hudson County",
  stateAbbrev: "NJ",
  planYear: 2026,
  plans: [
    { contractId: "H5141", planId: "004", planYear: 2026 },
    { contractId: "H5141", planId: "007", planYear: 2026 },
  ],
};

export const formatPlanRef = (ref: PlanRef): string => `${ref.contractId}-${ref.planId}`;

export const isSamePlan = (a: PlanRef, b: PlanRef): boolean =>
  a.contractId === b.contractId && a.planId === b.planId && a.planYear === b.planYear;

export const findPlanRef = (contractId: string, planId: string): PlanRef | null =>
  CORPUS_SCOPE.plans.find((ref) => ref.contractId === contractId && ref.planId === planId) ?? null;

/** Contracts the corpus covers, in declaration order. */
export const contractIds = (): string[] => [
  ...new Set(CORPUS_SCOPE.plans.map((ref) => ref.contractId)),
];

/**
 * The contract stamped on documents that belong to no single plan. They are
 * contract-wide, so a corpus spanning two contracts cannot attribute them and
 * must say so rather than picking the first.
 */
export function soleContractId(): string {
  const contracts = contractIds();
  const only = contracts[0];
  if (contracts.length !== 1 || only === undefined) {
    throw new Error(
      `contract-wide documents cannot be stamped: the corpus spans ${contracts.join(", ")}`,
    );
  }
  return only;
}
