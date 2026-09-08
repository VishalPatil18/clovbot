import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A deploy that hands Cloud Run a malformed environment produces a service that
 * answers /api/plans and 503s on every question, because only the question path
 * reads the database. Both checks here catch that at build time instead.
 */

/** Splits a --set-env-vars value the way gcloud does: a leading ^X^ sets the separator. */
function parseEnvFlag(flag: string): Record<string, string> {
  const custom = /^\^([^^]+)\^/.exec(flag);
  const separator = custom === null ? "," : custom[1]!;
  const body = custom === null ? flag : flag.slice(custom[0].length);
  return Object.fromEntries(
    body.split(separator).map((pair) => {
      const at = pair.indexOf("=");
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );
}

/** Runs the deploy script against a stub gcloud and returns the flags it passed. */
function runDeploy(): string[] {
  const script = resolve("scripts/deploy-api.sh");
  const dir = mkdtempSync(join(tmpdir(), "clovbot-deploy-"));
  const argsFile = join(dir, "args");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "gcloud"),
    `#!/usr/bin/env bash\n` +
      `if [[ "$1" == "run" && "$2" == "deploy" ]]; then printf '%s\\n' "$@" > "${argsFile}"; fi\n` +
      `if [[ "$1" == "run" && "$2" == "services" ]]; then echo "https://stub.invalid"; fi\n` +
      `exit 0\n`,
  );
  chmodSync(join(bin, "gcloud"), 0o755);

  // A password may hold a comma, which is why the script declares its own separator.
  writeFileSync(
    join(dir, ".env"),
    [
      "GCP_PROJECT_ID=stub-project",
      "CORPUS_SNAPSHOT_ID=2026-01-01T0000Z",
      "DATABASE_URL=postgresql://user:PASSWORD@host:5432/postgres?options=a,b",
      "AZURE_OPENAI_ENDPOINT=https://stub.invalid",
      "AZURE_OPENAI_API_KEY=stub-azure-key",
      "AZURE_OPENAI_API_VERSION=2025-01-01-preview",
      "AZURE_OPENAI_DEPLOYMENT=gpt-4o",
      "AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small",
      "ELEVENLABS_API_KEY=stub-voice-key",
      "",
    ].join("\n"),
  );

  execFileSync("bash", [script], {
    cwd: dir,
    env: { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` },
    encoding: "utf8",
  });
  return readFileSync(argsFile, "utf8").split("\n");
}

describe("deploy passes an environment Cloud Run can read", () => {
  const flags = runDeploy();
  const env = parseEnvFlag(flags[flags.indexOf("--set-env-vars") + 1] ?? "");

  it("names every variable exactly, with no separator left in the name", () => {
    expect(Object.keys(env).filter((name) => !/^[A-Z0-9_]+$/.test(name))).toEqual([]);
  });

  it("carries the database URL under its own name, commas intact", () => {
    expect(env["DATABASE_URL"]).toBe(
      "postgresql://user:PASSWORD@host:5432/postgres?options=a,b",
    );
  });

  it("leaves no separator fragment in a value", () => {
    expect(Object.values(env).filter((value) => value.includes("^"))).toEqual([]);
  });
});

describe("the server refuses to start on a broken environment", () => {
  it("exits rather than listening when DATABASE_URL is absent", () => {
    const { DATABASE_URL: _omitted, ...env } = process.env;
    const result = spawnSync("node", ["--experimental-strip-types", "src/server.ts"], {
      env: { ...env, PORT: "0" },
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result.stdout).not.toContain("api listening");
    expect(result.status).not.toBe(0);
  });
});
