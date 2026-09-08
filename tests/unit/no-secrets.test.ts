import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * NFR-SEC-03: no credential, key or endpoint appears in the repository.
 *
 * Environment variables stop a key being *needed* in the repo; they do not stop
 * one being committed. This scans what git actually tracks, so a key pasted into
 * a source file or an accidentally committed .env fails the build rather than
 * being published.
 *
 * Deliberately not a new tool: it runs in the suite that already gates CI.
 */
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => path.length > 0)
  // Binary and vendored files carry high-entropy strings that are not secrets.
  .filter((path) => !/\.(png|jpe?g|gif|webp|mp3|pdf|onnx|woff2?|ico|crt|lock)$/i.test(path))
  .filter((path) => !path.startsWith("node_modules/") && path !== "package-lock.json");

const read = (path: string): string => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

const files = tracked.map((path) => ({ path, text: read(path) }));

/** Shapes that are credentials wherever they appear. */
const PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "ElevenLabs key", pattern: /\bsk_[0-9a-f]{40,}\b/ },
  { name: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "private key block", pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "JSON web token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    name: "Postgres connection string with a password",
    pattern: /postgres(?:ql)?:\/\/[^\s:'"]+:(?!PASSWORD\b)[^\s@'"]{6,}@/,
  },
];

describe("no secrets in the repository [NFR-SEC-03]", () => {
  it("tracks files to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never commits the .env file", () => {
    expect(tracked).not.toContain(".env");
    expect(tracked.filter((path) => /^\.env\./.test(path) && path !== ".env.example")).toEqual([]);
  });

  for (const { name, pattern } of PATTERNS) {
    it(`contains no ${name}`, () => {
      const hits = files
        .filter((file) => pattern.test(file.text))
        // The scanner states the shapes it looks for; matching itself is not a leak.
        .filter((file) => file.path !== "tests/unit/no-secrets.test.ts")
        .map((file) => file.path);
      expect(hits).toEqual([]);
    });
  }

  /**
   * The example documents the shape of the environment, so model names and
   * corpus scope belong in it. Only the keys that carry a credential must be
   * empty or obviously a placeholder.
   */
  it("carries no real credential in .env.example", () => {
    const secretish = /_(API_KEY|TOKEN|SECRET|PASSWORD)$|^DATABASE_URL$/;
    const placeholder = /YOUR|PLACEHOLDER|REPLACE|PROJECT_REF|PASSWORD|REGION|xxx/i;

    const filled = read(".env.example")
      .split("\n")
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .filter(([, name]) => secretish.test(name ?? ""))
      .filter(([, , value]) => (value ?? "").trim().length > 0)
      .filter(([, , value]) => !placeholder.test(value ?? ""))
      .map(([line]) => line);

    expect(filled).toEqual([]);
  });

  it("names every secret the deploy needs, so nothing is passed by accident", () => {
    const script = read("scripts/deploy-api.sh");
    for (const name of ["DATABASE_URL", "AZURE_OPENAI_API_KEY", "ELEVENLABS_API_KEY"]) {
      expect(script).toContain(name);
    }
    // Values come from the environment at deploy time, never from the image.
    expect(read("Dockerfile")).not.toMatch(/API_KEY=\S/);
    expect(read("Dockerfile")).not.toMatch(/DATABASE_URL=\S/);
  });
});
