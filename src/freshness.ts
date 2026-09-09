/**
 * Whether the calendar has overtaken the plan documents, and what to say if so.
 * The clock is a parameter so the boundary can be tested rather than waited for.
 */
export function stalenessWarning(corpusPlanYear: number, now: Date): string | null {
  // UTC, or the boundary moves with the deployment. Early tells a member to
  // check sooner; late would be wrong.
  const currentYear = now.getUTCFullYear();
  if (currentYear <= corpusPlanYear) return null;
  return (
    `These are your ${String(corpusPlanYear)} plan documents. It is now ${String(currentYear)}, ` +
    "so your costs may have changed. Call to check before you rely on this."
  );
}
