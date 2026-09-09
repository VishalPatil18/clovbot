/**
 * Whether an answer depends on the member's plan, so the prompt is lazy.
 * Plans share prose and differ on price: cost and coverage are scoped, process is not.
 */
const PLAN_SCOPED =
  /\b(copay|co-pay|coinsurance|deductible|premium|out[- ]of[- ]pocket|maximum|allowance|cost|costs|price|pay|paid|charge|owe|tier|covered|cover|coverage|in[- ]network|out[- ]of[- ]network|network|benefit|benefits)\b/i;

/** Beats the keyword rule: these ask how something works, not what it costs. */
const PROCESS_ONLY =
  /\b(how do i|how does|what does .* mean|what is a|what happens|process|appeal|appeals|grievance|complain|complaint|prior authorization|prior auth|deadline|timeline|file|submit|who is|what is clover)\b/i;

const COST_PHRASING = /\b(run me|set me back|come to|looking at paying|how much)\b/i;

export function needsPlanContext(question: string): boolean {
  const text = question.trim();
  if (text.length === 0) return false;
  if (COST_PHRASING.test(text)) return true;
  if (PROCESS_ONLY.test(text)) return false;
  return PLAN_SCOPED.test(text);
}
