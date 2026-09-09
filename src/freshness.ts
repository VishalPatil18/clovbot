/**
 * Whether an answer's plan documents have been overtaken by the calendar, and
 * what to tell the member if so. FR-P2-17.
 *
 * The clock is a parameter so the boundary can be tested rather than waited for.
 */
export function stalenessWarning(corpusPlanYear: number, now: Date): string | null {
  // UTC, not local: the container runs UTC while members are in Eastern, and a
  // local comparison would move the boundary with the deployment. Erring up to
  // five hours early only tells a member to check sooner; late would be wrong.
  const currentYear = now.getUTCFullYear();
  if (currentYear <= corpusPlanYear) return null;
  return (
    `These are your ${String(corpusPlanYear)} plan documents. It is now ${String(currentYear)}, ` +
    "so your costs may have changed. Call to check before you rely on this."
  );
}
