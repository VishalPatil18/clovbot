# Contributing

Thanks for your interest in contributing. This project follows a strict **Spec-Driven Development** workflow - please read this guide before opening a PR.

---

## Ground Rules

1. **Specs come before code.** New features start in `claude/srs.md` or `claude/features.md`, not in source files.
2. **Cross-question before you implement.** If a requirement is ambiguous, open a discussion before writing code.
3. **One concern per PR.** Bug fixes do not include refactors. Refactors do not include new features.
4. **Memory updates are part of the work.** If you ship a feature, you also update `claude/context.md`, `claude/features.md`, `claude/design-decisions.md`, and `CHANGELOG.md`.

---

## Workflow

### For a new feature

1. Open an issue using the [Feature request template](./.github/ISSUE_TEMPLATE/feature_request.md).
2. In Claude Code, run `/spec-feature` from the project root.
3. Step through all six phases. Do not skip.
4. Open a PR. The PR template will walk you through verification.

### For a bug

1. Open an issue using the [Bug report template](./.github/ISSUE_TEMPLATE/bug_report.md) with reproduction steps.
2. In Claude Code, run `/spec-bug`.
3. The skill will produce: a repro, a failing test, the smallest fix, and a `CHANGELOG.md` entry.
4. Open a PR.

### For documentation

1. In Claude Code, run `/spec-docs`.
2. Review the proposed diff.
3. Open a PR.

---

## Code Style

- Files: small and focused (target 200–400 lines, 800 max).
- Functions: small and focused (target under 50 lines).
- Naming: descriptive - no single-letter variables outside trivial scopes.
- Errors: handled explicitly. No silent swallows.
- Immutability: prefer new objects over in-place mutation.

---

## Tests

- New behavior requires new tests.
- Bug fixes require a regression test that fails before the fix.
- Target ≥80% coverage on touched code.

---

## Commit Messages

Conventional Commits format:

```text
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

---

## PR Checklist

See the [pull request template](./.github/pull_request_template.md).
