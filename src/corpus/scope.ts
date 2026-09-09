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
 * One definition of what the corpus covers, shared by every command that needed it
 * and previously disagreed. Adding a plan is one record.
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
    { contractId: "H8010", planId: "002", planYear: 2026 },
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

/** Catalog names, so a member reads a plan name and never a contract number. */
const PLAN_NAMES: Record<string, string> = {
  "H5141-004": "Clover Health Choice (PPO)",
  "H5141-007": "Clover Health Choice Value (PPO)",
  "H8010-002": "Clover Health Classic (HMO)",
};

export function planDisplayName(ref: PlanRef): string {
  const name = PLAN_NAMES[formatPlanRef(ref)];
  if (name === undefined) {
    throw new Error(`no display name for ${formatPlanRef(ref)}; a member must never read a contract id`);
  }
  return name;
}

/**
 * The plan answered when a question needs no plan context. Retrieval still runs
 * scoped, so something has to be chosen; the first declared plan is that choice.
 */
export function defaultPlanRef(): PlanRef {
  const first = CORPUS_SCOPE.plans[0];
  if (first === undefined) throw new Error("corpus scope declares no plans");
  return first;
}

export const defaultContractId = (): string => defaultPlanRef().contractId;

export interface PlanChoice {
  contractId: string;
  id: string;
  planYear: number;
  name: string;
}

export const toPlanChoices = (refs: PlanRef[]): PlanChoice[] =>
  refs.map((ref) => ({
    contractId: ref.contractId,
    id: ref.planId,
    planYear: ref.planYear,
    name: planDisplayName(ref),
  }));

/** Both halves must match: a plan id alone would scope to another contract's amounts. */
export function resolveIndexedPlan(
  plans: PlanChoice[],
  contractId: string | null,
  planId: string,
): PlanRef | null {
  const contract = contractId ?? plans[0]?.contractId;
  const match = plans.find((plan) => plan.contractId === contract && plan.id === planId);
  return match === undefined
    ? null
    : { contractId: match.contractId, planId: match.id, planYear: match.planYear };
}
