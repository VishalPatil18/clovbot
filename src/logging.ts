const REDACTED = "[redacted]";

/**
 * Ordered so the most specific shape wins. Each pattern removes an identifier
 * shape rather than any long number, because "30 day supply", "$40" and "2026"
 * all have to survive for the turn log to remain useful for corpus expansion.
 */
const IDENTIFIER_PATTERNS: RegExp[] = [
  // Social security number.
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Date of birth, written either way round.
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g,
  // Member, subscriber or claim numbers: 7 or more digits, optionally hyphenated.
  /\b(?!\$)\d[\d-]{6,}\d\b/g,
  // Alphanumeric member ids, which carry at least one digit and one letter.
  /\b(?=[A-Za-z-]*\d)(?=[\d-]*[A-Za-z])[A-Za-z]{1,4}\d[A-Za-z\d]{5,}\b/g,
];

/**
 * Removes identifier-shaped strings before a question is persisted. FR-31.
 * Conservative by design: the surrounding question must survive, because the
 * turn log drives corpus expansion.
 *
 * D-034 extends this ahead of the model call as well, not only the log write,
 * because the Gemini fallback may train on what it receives.
 */
export function redactIdentifiers(text: string): string {
  let redacted = text;
  for (const pattern of IDENTIFIER_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  return redacted;
}
