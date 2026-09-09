import type { Speech } from "./i18n.ts";

/**
 * One place where untrusted request bodies become typed values.
 *
 * Every field is coerced to a safe default rather than thrown on: a missing or
 * wrong-typed field must not be the difference between an answer and a 500.
 * Ceilings live here too, so no endpoint can quietly grow an unbounded one.
 */

export const LIMITS = {
  body: 200_000,
  question: 500,
  note: 1_000,
  email: 254,
  code: 32,
  speakText: 5_000,
  audioBytes: 8 * 1024 * 1024,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Null for anything that is not a JSON object, which every endpoint expects. */
function body(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : "";

const nullableText = (value: unknown): string | null => (typeof value === "string" ? value : null);

const speech = (value: unknown): Speech => (value === "es" ? "es" : "en");

export interface AskRequest {
  question: string;
  planId: string | null;
  contractId: string | null;
  language: Speech;
}

export function askRequest(raw: string): AskRequest | null {
  const fields = body(raw);
  if (fields === null) return null;
  return {
    question: text(fields["question"], LIMITS.question).trim(),
    planId: nullableText(fields["planId"]),
    contractId: nullableText(fields["contractId"]),
    language: speech(fields["language"]),
  };
}

export interface CallbackRequest {
  question: string;
  planContext: string | null;
  documentsSearched: string[];
  refusalTrigger: string | null;
  note: string | null;
}

export function callbackRequest(raw: string): CallbackRequest | null {
  const fields = body(raw);
  if (fields === null) return null;
  const documents = fields["documentsSearched"];
  return {
    question: text(fields["question"], LIMITS.question),
    planContext: nullableText(fields["planContext"]),
    documentsSearched: Array.isArray(documents)
      ? documents.filter((entry): entry is string => typeof entry === "string")
      : [],
    refusalTrigger: nullableText(fields["refusalTrigger"]),
    note: typeof fields["note"] === "string" ? fields["note"].slice(0, LIMITS.note) : null,
  };
}

export function loginRequest(raw: string): { email: string } | null {
  const fields = body(raw);
  if (fields === null) return null;
  return { email: text(fields["email"], LIMITS.email).trim() };
}

export function loginVerify(raw: string): { email: string; code: string } | null {
  const fields = body(raw);
  if (fields === null) return null;
  return {
    email: text(fields["email"], LIMITS.email).trim(),
    code: text(fields["code"], LIMITS.code),
  };
}

export interface FeedbackRequest<Reason extends string> {
  turnId: string;
  resolved: boolean | null;
  reason: Reason | null;
}

/**
 * The allowed reasons are passed in rather than imported, so the wire values
 * have one home and this module stays free of the database layer.
 */
export function feedbackRequest<Reason extends string>(
  raw: string,
  allowed: readonly Reason[],
): FeedbackRequest<Reason> | null {
  const fields = body(raw);
  if (fields === null) return null;
  return {
    turnId: text(fields["turnId"], LIMITS.code),
    resolved: typeof fields["resolved"] === "boolean" ? fields["resolved"] : null,
    reason: allowed.find((candidate) => candidate === fields["reason"]) ?? null,
  };
}

export function speakRequest(raw: string): { text: string; language: Speech } | null {
  const fields = body(raw);
  if (fields === null) return null;
  return {
    text: text(fields["text"], LIMITS.speakText).trim(),
    language: speech(fields["language"]),
  };
}
