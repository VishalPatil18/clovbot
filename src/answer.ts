import type { AnswerPayload, ValidationResult } from "./types.ts";

/**
 * Validates the model payload at the trust boundary. FR-32.
 * Hand-rolled: CLAUDE.md section 5 specifies Zod here, deferred pending dependency approval.
 */
export function validateAnswerPayload(_raw: unknown): ValidationResult {
  throw new Error("not implemented");
}

/**
 * Every cited id must have been retrieved this turn. Catches a hallucinated
 * citation that is otherwise structurally valid. Returns the offending ids.
 */
export function findContainmentViolations(
  _payload: AnswerPayload,
  _retrievedIds: readonly string[],
): string[] {
  throw new Error("not implemented");
}
