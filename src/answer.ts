import type { AnswerPayload, Claim, Headline, Refusal, RefusalTrigger, ValidationResult } from "./types.ts";

const TRIGGERS: RefusalTrigger[] = [
  "C-01", "C-02", "C-03", "C-04", "C-05",
  "C-06", "C-07", "C-08", "C-09", "C-10",
  "requires_member_data",
  "unsupported_language",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Validates the model payload at the trust boundary. FR-32.
 * Hand-rolled: CLAUDE.md section 5 specifies Zod here, deferred pending dependency approval.
 */
export function validateAnswerPayload(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(raw)) return { ok: false, errors: ["payload is not an object"] };

  const claims = parseClaims(raw["claims"], errors);
  const unanswered = parseUnanswered(raw["unanswered"], errors);
  const refusal = parseRefusal(raw["refusal"], errors);
  const headline = parseHeadline(raw["headline"], errors);

  // A payload that both asserts and declines leaves the caller no defensible
  // rendering, so it is rejected rather than resolved by precedence.
  if (refusal !== null && claims.length > 0) {
    errors.push("payload both makes claims and refuses");
  }
  if (refusal !== null && headline !== null) {
    errors.push("payload both states an amount and refuses");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { claims, unanswered, refusal, headline } };
}

/** Absent is the normal case: most answers are not a single amount. D-065. */
function parseHeadline(raw: unknown, errors: string[]): Headline | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) {
    errors.push('"headline" is not an object');
    return null;
  }
  const label = typeof raw["label"] === "string" ? raw["label"].trim() : "";
  const amount = typeof raw["amount"] === "string" ? raw["amount"].trim() : "";
  const citationIds = Array.isArray(raw["citationIds"])
    ? raw["citationIds"].filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (label.length === 0) errors.push('"headline" has no label; a bare amount is ambiguous');
  if (amount.length === 0) errors.push('"headline" has no amount');
  if (citationIds.length === 0) errors.push('"headline" has no citation; FR-05 binds it as a claim');
  if (errors.length > 0) return null;
  return { label, amount, citationIds };
}

function parseClaims(raw: unknown, errors: string[]): Claim[] {
  if (raw === undefined) {
    errors.push('missing "claims"');
    return [];
  }
  if (!Array.isArray(raw)) {
    errors.push('"claims" is not an array');
    return [];
  }

  const claims: Claim[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      errors.push(`claim ${index} is not an object`);
      continue;
    }
    const text = entry["text"];
    if (typeof text !== "string" || text.trim().length === 0) {
      errors.push(`claim ${index} has no text`);
      continue;
    }
    const ids = entry["citationIds"];
    // An uncited claim is structurally impossible rather than merely detectable.
    if (!Array.isArray(ids) || ids.length === 0) {
      errors.push(`claim ${index} carries no citation`);
      continue;
    }
    const citationIds = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
    if (citationIds.length !== ids.length) {
      errors.push(`claim ${index} has a malformed citation id`);
      continue;
    }
    claims.push({ text, citationIds });
  }
  return claims;
}

function parseUnanswered(raw: unknown, errors: string[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push('"unanswered" is not an array');
    return [];
  }
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function parseRefusal(raw: unknown, errors: string[]): Refusal | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) {
    errors.push("refusal is not an object");
    return null;
  }

  const trigger = raw["trigger"];
  if (typeof trigger !== "string" || !TRIGGERS.includes(trigger as RefusalTrigger)) {
    errors.push(`unknown refusal trigger ${JSON.stringify(trigger)}`);
    return null;
  }
  const explanation = raw["explanation"];
  if (typeof explanation !== "string" || explanation.trim().length === 0) {
    errors.push("refusal has no explanation");
    return null;
  }
  // FR-22: a refusal states the boundary and offers the human path. One without
  // the human path is a dead end, which is the failure D-010 exists to prevent.
  if (raw["humanPathOffered"] !== true) {
    errors.push("refusal offers no human path");
    return null;
  }
  return { trigger: trigger as RefusalTrigger, explanation, humanPathOffered: true };
}

/**
 * Every cited id must have been retrieved this turn. Catches a hallucinated
 * citation that is otherwise structurally valid. Returns the offending ids.
 */
export function findContainmentViolations(
  payload: AnswerPayload,
  retrievedIds: readonly string[],
): string[] {
  const retrieved = new Set(retrievedIds);
  const violations = new Set<string>();
  for (const claim of payload.claims) {
    for (const id of claim.citationIds) {
      if (!retrieved.has(id)) violations.add(id);
    }
  }
  return [...violations];
}
