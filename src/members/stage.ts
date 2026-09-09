export type PartDStage = "deductible" | "initial" | "catastrophic";

export interface DrugThresholds {
  /** Yearly Part D deductible for this plan, in dollars. */
  drugDeductible: number;
  /** Out-of-pocket limit at which catastrophic coverage begins. */
  outOfPocketLimit: number;
}

/**
 * Derived from spend, never stored beside it: a stored value can contradict the
 * figure printed next to it. Thresholds come from each plan's own document.
 */
export function partDStage(spendYtd: number, thresholds: DrugThresholds): PartDStage {
  if (!Number.isFinite(spendYtd) || spendYtd < 0) {
    throw new Error(`drug spend must be zero or more, got ${String(spendYtd)}`);
  }
  if (thresholds.drugDeductible >= thresholds.outOfPocketLimit) {
    throw new Error(
      `threshold order is wrong: deductible ${String(thresholds.drugDeductible)} ` +
        `is not below the out-of-pocket limit ${String(thresholds.outOfPocketLimit)}`,
    );
  }
  if (spendYtd >= thresholds.outOfPocketLimit) return "catastrophic";
  if (spendYtd >= thresholds.drugDeductible) return "initial";
  return "deductible";
}
