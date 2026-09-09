import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/server.ts", "utf8");
const authStore = readFileSync("src/auth/store.ts", "utf8");

describe("member data needs a live session [FR-P2-45 structural half]", () => {
  /*
   * The member id reaches answerTurn from a session row and from nowhere else.
   * Stage 7 adds a classifier that decides which questions need one; a
   * classifier can be wrong, and this is what makes being wrong harmless.
   */
  it("takes the member id from a resolved session, never from the request", () => {
    expect(server).toMatch(/const member = await currentSession\(client, memberToken, new Date\(\)\)/);
    expect(server).toMatch(/member === null \? \{\} : \{ memberId: member\.memberId \}/);
  });

  it("never reads a member id out of the request body", () => {
    const ask = server.slice(server.indexOf("async function handleAsk"));
    expect(ask).not.toMatch(/parsed\.memberId|body.*memberId/);
  });

  it("refuses a cookie that is not a session id shape", () => {
    expect(authStore).toMatch(/\/\^\[0-9a-f-\]\{36\}\$\/\.test\(sessionId\)/);
  });

  it("ends a session that has idled or hit the cap rather than refreshing it", () => {
    expect(authStore).toMatch(/if \(state !== "live"\)[\s\S]*?endSession/);
  });

  it("rotates the session id on sign-in, so a known id cannot become authenticated", () => {
    expect(authStore).toMatch(/randomUUID\(\)/);
    expect(server).toMatch(/const sessionId = await startSession\(client, memberId\)/);
  });
});

describe("codes never reach a log or a caller [FR-P2-41]", () => {
  // The word "code" in a log label is fine; an interpolated code value is not.
  it("logs delivery status, never a code value", () => {
    expect(server).toContain("login code requested: delivery ${delivery.detail}");
    const logs = server.match(/console\.[a-z]+\(`[^`]*`/g) ?? [];
    for (const line of logs) expect(line).not.toMatch(/\$\{\s*code\s*\}/);
  });

  // Saying "no such address" turns the endpoint into a membership oracle.
  it("answers the same whether or not the address is enrolled", () => {
    expect(server).toMatch(/const CODE_SENT = \{ sent: true \}/);
    const request = server.slice(server.indexOf("async function handleLoginRequest"));
    expect(request.slice(0, 2_000)).not.toMatch(/404|not found|unknown address/i);
  });

  it("rate limits per address and per IP", () => {
    expect(server).toMatch(/checkRate\(client, `otp:\$\{email\.toLowerCase\(\)\}`, CODE_LIMIT_PER_EMAIL/);
    expect(server).toMatch(/checkRate\(client, `otp-ip:\$\{ip\}`, CODE_LIMIT_PER_IP/);
    expect(server).toMatch(/CODE_LIMIT_PER_EMAIL = 10/);
    expect(server).toMatch(/CODE_LIMIT_PER_IP = 30/);
  });

  it("explains a failed sign-in in plain words, never a raw error", () => {
    for (const kind of ["wrong", "expired", "used", "locked"]) {
      expect(server, kind).toMatch(new RegExp(`${kind}: "[A-Z]`));
    }
  });
});
