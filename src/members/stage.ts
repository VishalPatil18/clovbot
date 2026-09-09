export type PartDStage = "deductible" | "initial" | "catastrophic";

export interface DrugThresholds {
  /** Yearly Part D deductible for this plan, in dollars. */
  drugDeductible: number;
  /** Out-of-pocket limit at which catastrophic coverage begins. */
  outOfPocketLimit: number;
}

/**
 * Which Part D payment stage a member is in, worked out from what they have
 * spent rather than stored beside it. A stored stage can contradict the spend
 * printed next to it, and nothing would catch that. D-081.
 *
 * Thresholds are per plan and read from that plan's Evidence of Coverage:
 * H5141-004 deducts $150 on tiers 3, 4 and 5, H5141-007 deducts $220, and both
 * reach catastrophic coverage at $2,100 out of pocket.
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
