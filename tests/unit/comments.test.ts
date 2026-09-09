import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TREES = ["src", "web/src", "tests", "scripts", "eval", "migrations"];
const EXTENSIONS = [".ts", ".tsx", ".sql", ".css"];

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : EXTENSIONS.some((extension) => entry.name.endsWith(extension))
        ? [join(dir, entry.name)]
        : [],
  );

interface Comment {
  file: string;
  line: number;
  text: string;
}

const comments = (file: string): Comment[] => {
  const found: Comment[] = [];
  // Only SQL uses `--`; in CSS it opens a custom property, not a comment.
  const dashComments = file.endsWith(".sql");
  let inBlock = false;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((raw, index) => {
      const line = raw.trim();
      const push = (text: string): void => {
        if (text.trim().length > 0) found.push({ file, line: index + 1, text: text.trim() });
      };
      if (inBlock) {
        push(line.replace(/^\*+/, "").replace(/\*\/.*$/, ""));
        if (line.includes("*/")) inBlock = false;
        return;
      }
      if (line.startsWith("/*")) {
        push(line.replace(/^\/\*+/, "").replace(/\*\/.*$/, ""));
        if (!line.includes("*/")) inBlock = true;
        return;
      }
      if (line.startsWith("//")) return push(line.slice(2));
      if (dashComments && line.startsWith("--")) return push(line.slice(2));
    });
  return found;
};

const ALL = TREES.flatMap(files).flatMap(comments);

// A reader without the plan open gets a dead pointer; the code outlives it.
const REFERENCES: [string, RegExp][] = [
  ["requirement id", /\b(?:FR|NFR)-[A-Z0-9]*-?\d+/],
  ["decision id", /\b(?:D|ADR)-\d{2,}/],
  ["stage or phase", /\b(?:Stage|Phase)\s+\d/i],
  ["build pass", /\bP[1-4]\b|plan-p[1-4]|\bsrs(?:-p\d)?\.md/i],
  ["release", /\bv[12]\.\d(?:\.\d)?\b/],
];

describe("comments", () => {
  it("finds them", () => {
    expect(ALL.length).toBeGreaterThan(200);
  });

  for (const [what, pattern] of REFERENCES) {
    it(`carries no ${what}`, () => {
      const offenders = ALL.filter((comment) => pattern.test(comment.text)).map(
        (comment) => `${comment.file}:${comment.line}  ${comment.text.slice(0, 70)}`,
      );
      expect(offenders, offenders.slice(0, 40).join("\n")).toHaveLength(0);
    });
  }
});
