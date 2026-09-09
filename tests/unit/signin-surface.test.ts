import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const signin = readFileSync("web/src/components/SignIn.tsx", "utf8");
const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
const css = readFileSync("web/src/app.css", "utf8");
const rule = (selector: string): string =>
  new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`, "s").exec(css)?.[1] ?? "";

describe("inline sign-in [FR-P2-33, FR-P2-34]", () => {
  // FR-P2-34: no navigation, so the conversation survives the detour.
  it("signs in inside the panel with no link away", () => {
    expect(signin).not.toMatch(/window\.location|<a href|history\.push/);
    expect(assistant).toContain("<SignIn");
  });

  // WCAG 3.3.8: a pasted code must work, and no cognitive test is imposed.
  it("lets the code be pasted and autofilled", () => {
    expect(signin).toContain('autoComplete="one-time-code"');
    expect(signin).toContain('inputMode="numeric"');
    expect(signin).not.toMatch(/onPaste=\{[^}]*preventDefault/);
  });

  it("keeps the field at the 16px floor so a phone does not zoom", () => {
    expect(rule(".signin__input")).toContain("var(--text-input)");
    expect(rule(".signin__input")).toContain("min-height: var(--target-min)");
  });

  it("offers a new code rather than stranding someone on an expired one", () => {
    expect(signin).toContain("Send a new code");
  });

  it("announces the outcome to a screen reader", () => {
    expect(signin).toMatch(/role="status"/);
    expect(signin).toMatch(/role="alert"/);
  });
});

describe("session visibility [FR-P2-37, FR-P2-38, FR-P2-39]", () => {
  it("shows who is signed in, or that nobody is, in every state", () => {
    expect(assistant).toContain("Not signed in");
    expect(assistant).toMatch(/Signed in as \{signedInAs\}/);
  });

  it("offers sign out in one tap beside the indicator", () => {
    expect(assistant).toMatch(/onClick=\{\(\) => void leave\(\)\}/);
    expect(assistant).toContain("Sign out");
  });

  // FR-P2-39: a shared device must not keep the previous member's record data.
  it("clears record-sourced turns when signing out", () => {
    expect(assistant).toMatch(/const leave[\s\S]*?clearMemberTurns\(\)/);
  });

  it("asks the server who is signed in rather than assuming nobody is", () => {
    expect(assistant).toContain("fetchSession()");
  });
});
