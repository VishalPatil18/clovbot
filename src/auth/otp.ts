import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/** FR-P2-31. Ten minutes: long enough to find the email, short enough to matter. */
export const CODE_TTL_MS = 10 * 60 * 1_000;

/** FR-P2-31. Five wrong tries and the code is dead, not the account. */
export const ATTEMPT_LIMIT = 5;

export interface IssuedCode {
  codeHash: string;
  salt: string;
  issuedAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export type VerifyResult = { kind: "ok" | "wrong" | "expired" | "used" | "locked" };

/** Six digits, uniformly drawn, leading zeros kept. */
export const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const newSalt = (): string => randomBytes(16).toString("hex");

/**
 * FR-P2-41. A six-digit code has a million possibilities, so a fast hash would
 * fall to an offline sweep in seconds if the table ever leaked. scrypt is
 * deliberately slow, and one verification per attempt with at most five
 * attempts makes that cost invisible here.
 */
export const hashCode = (code: string, salt: string): string =>
  scryptSync(normalize(code), salt, 32).toString("hex");

/** A pasted code often arrives with spaces. WCAG 3.3.8 asks that it still work. */
const normalize = (code: string): string => code.replace(/\s+/g, "");

const sameHash = (a: string, b: string): boolean => {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  // Length is checked separately: timingSafeEqual throws on a mismatch.
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Order matters. Expiry, use and lockout are decided before the code is
 * compared, so a dead code cannot be probed for correctness after its window.
 */
export function verifyCode(submitted: string, issued: IssuedCode, now: Date): VerifyResult {
  if (issued.consumedAt !== null) return { kind: "used" };
  if (now.getTime() - issued.issuedAt.getTime() >= CODE_TTL_MS) return { kind: "expired" };
  if (issued.attempts >= ATTEMPT_LIMIT) return { kind: "locked" };
  return sameHash(hashCode(submitted, issued.salt), issued.codeHash)
    ? { kind: "ok" }
    : { kind: "wrong" };
}
