import { describe, expect, it } from "vitest";
import {
  ATTEMPT_LIMIT,
  CODE_TTL_MS,
  generateCode,
  hashCode,
  verifyCode,
} from "../../src/auth/otp.ts";

const now = new Date("2026-09-09T10:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

const issued = (code: string, over: Partial<Parameters<typeof verifyCode>[1]> = {}) => ({
  codeHash: hashCode(code, "salt-1"),
  salt: "salt-1",
  issuedAt: now,
  attempts: 0,
  consumedAt: null,
  ...over,
});

describe("generateCode [FR-P2-30]", () => {
  it("is always six digits", () => {
    for (let i = 0; i < 200; i += 1) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  // A predictable code is not a second factor.
  it("does not repeat itself over many draws", () => {
    const drawn = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(drawn.size).toBeGreaterThan(150);
  });

  it("uses the whole range, including codes with leading zeros", () => {
    const many = Array.from({ length: 4_000 }, () => generateCode());
    expect(many.some((code) => code.startsWith("0"))).toBe(true);
  });
});

describe("hashCode [FR-P2-41]", () => {
  // A stored code is a live credential. The database never holds one.
  it("never returns the code itself", () => {
    expect(hashCode("123456", "salt-1")).not.toContain("123456");
  });

  it("gives the same code different hashes under different salts", () => {
    expect(hashCode("123456", "salt-1")).not.toBe(hashCode("123456", "salt-2"));
  });

  it("is stable for the same code and salt", () => {
    expect(hashCode("123456", "salt-1")).toBe(hashCode("123456", "salt-1"));
  });
});

describe("verifyCode [FR-P2-31]", () => {
  it("accepts the right code inside the window", () => {
    expect(verifyCode("123456", issued("123456"), later(60_000)).kind).toBe("ok");
  });

  it("rejects the wrong code", () => {
    expect(verifyCode("999999", issued("123456"), later(60_000)).kind).toBe("wrong");
  });

  it("rejects a code past its expiry", () => {
    expect(verifyCode("123456", issued("123456"), later(CODE_TTL_MS + 1)).kind).toBe("expired");
  });

  it("accepts a code on the last millisecond before expiry", () => {
    expect(verifyCode("123456", issued("123456"), later(CODE_TTL_MS - 1)).kind).toBe("ok");
  });

  // Single use: a code that already signed someone in is spent.
  it("rejects a code that has already been used", () => {
    const used = issued("123456", { consumedAt: later(10_000) });
    expect(verifyCode("123456", used, later(20_000)).kind).toBe("used");
  });

  it("rejects every attempt once the attempt limit is reached", () => {
    const exhausted = issued("123456", { attempts: ATTEMPT_LIMIT });
    expect(verifyCode("123456", exhausted, later(60_000)).kind).toBe("locked");
  });

  it("still has attempts left one below the limit", () => {
    const nearly = issued("123456", { attempts: ATTEMPT_LIMIT - 1 });
    expect(verifyCode("123456", nearly, later(60_000)).kind).toBe("ok");
  });

  // Expiry and lockout are checked before the code, so a spent code cannot be
  // brute-forced past its window.
  it("reports expiry rather than wrongness for a bad code past its window", () => {
    expect(verifyCode("999999", issued("123456"), later(CODE_TTL_MS + 1)).kind).toBe("expired");
  });

  it("tolerates spaces a member pastes in with the code", () => {
    expect(verifyCode(" 123 456 ", issued("123456"), later(60_000)).kind).toBe("ok");
  });
});
