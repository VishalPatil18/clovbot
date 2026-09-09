import type { Citation, Claim } from "./api.ts";

interface Copyable {
  question: string;
  answer: string;
  claims: Claim[];
  citations: Citation[];
  unanswered: string[];
  staleness: string | null;
}

/**
 * FR-P2-21. Plain text, because a caregiver pastes into email, Notes or a text
 * message, and every one of those loses formatting but keeps lines. Sources
 * travel with the answer: a pasted claim without them is an uncited claim.
 */
export function answerAsText(turn: Copyable, planName: string, documentDate: string): string {
  const lines: string[] = [`Question: ${turn.question}`, ""];

  const body = turn.claims.length > 0 ? turn.claims.map((claim) => claim.text) : [turn.answer];
  lines.push(...body, "");

  if (turn.unanswered.length > 0) {
    lines.push("Not answered from the plan documents:");
    lines.push(...turn.unanswered.map((gap) => `- ${gap}`), "");
  }

  if (turn.citations.length > 0) {
    lines.push("Sources:");
    lines.push(...turn.citations.map((citation) => `- ${citation.label}`), "");
  }

  if (turn.staleness !== null) lines.push(turn.staleness, "");

  lines.push(`Plan: ${planName}`, `Plan documents collected: ${documentDate}`);
  return lines.join("\n");
}
