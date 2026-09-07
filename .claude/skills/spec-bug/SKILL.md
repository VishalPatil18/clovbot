---
name: spec-bug
description: Run an isolated bug resolution workflow. Use when the user says "there's a bug in X", "fix this issue", "reproduce this failure", or invokes `/spec-bug`. Refuses to proceed without a reproduction recipe (FR-BUG-01), delegates isolation to spec-bug-hunter, drives the smallest possible diff (FR-BUG-02), requires a failing-before / passing-after regression test (FR-BUG-03), forbids refactors or unrelated improvements (FR-BUG-04), and appends a line under `### Fixed` in CHANGELOG.md (FR-BUG-05).
---

# spec-bug

Run the isolated bug resolution workflow (SRS §5.3). One bug per invocation. No refactors. No scope creep.

The skill's job is to keep the bug's blast radius small: a specific defect reproduced, a specific test that captures it, the smallest possible fix, and a documented entry in `CHANGELOG.md`.

---

## Step 1 - Demand a reproduction recipe (FR-BUG-01)

Before doing anything else, ask for or verify a reproduction recipe. A recipe is:

- The exact command to run.
- The expected output.
- The actual output.
- The environment (versions, env vars, git SHA).

If the user cannot supply one - or the recipe you were handed does not reproduce the bug - **refuse to proceed**. Emit:

> Cannot proceed: I need a reproduction recipe that fails on this machine. Please supply the exact command, expected vs. actual output, and the environment. Without a reproducer, the fix cannot be verified.

Do not guess at the fix from symptoms. Do not "try a few things." The refusal is what keeps this workflow honest.

---

## Step 2 - Dispatch spec-bug-hunter

Once the reproduction recipe is confirmed, dispatch the **spec-bug-hunter** sub-agent with:

- The reproduction command.
- The observed symptom.
- The location the user thinks the bug lives (if they have a hypothesis - investigate their guess first).

The agent has `Read`, `Grep`, and `Bash` - no write authority. It returns:

- The isolated root cause (file and line).
- A draft regression test that fails against the current codebase.
- A recommended fix scope (files to touch, estimated diff size).

If spec-bug-hunter reports that the root cause is not in the user's hypothesized area, share that finding and confirm before continuing.

---

## Step 3 - Land the regression test first (FR-BUG-03)

Take spec-bug-hunter's draft regression test and add it to the appropriate test file. Run the test suite. **The new test MUST fail.** If it passes on the current codebase, either the test is wrong or the bug is not what you think it is - go back to Step 1.

The failure is the artifact that captures the defect. It is what turns "we think there is a bug" into "here is a bug."

---

## Step 4 - Dispatch spec-coder for the smallest fix (FR-BUG-02, FR-BUG-04)

Dispatch the **spec-coder** sub-agent with:

- The regression test.
- The recommended fix scope from spec-bug-hunter.
- Explicit instruction: **the smallest possible diff that turns the failing test green**.

Restrict spec-coder to the fix scope. Forbid:

- Refactors.
- Renaming for clarity.
- Adjacent cleanups.
- New abstractions.
- Style fixes to nearby code.

Any of those turn a bug fix into a mixed-purpose PR, which is exactly what FR-BUG-04 outlaws. If spec-coder wants to refactor, tell it to file a separate cycle after the bug ships.

Run the full test suite. The regression test MUST pass; every previously-passing test MUST still pass.

---

## Step 5 - Update CHANGELOG.md (FR-BUG-05)

Append a single line under `## [Unreleased]` → `### Fixed` in `CHANGELOG.md`:

```markdown
### Fixed

- {one-line description of the bug and where it was}. Regression test: {test path}.
```

Do NOT touch any other memory file (`claude/context.md`, `claude/features.md`, etc.). Bug fixes are a separate track from feature cycles - they do not update the feature log or the design decisions.

---

## Completion summary (NFR-USE-01)

When the CHANGELOG.md entry is written, print exactly one line summarising and a one-line next-step hint:

> Fixed {bug summary} ({N} files changed, 1 regression test added). Next: continue with `/spec-feature` for the next feature or `/spec-bug` for the next bug.

---

## Student persona note (NFR-USE-03)

If `CLAUDE.md` is scaffolded for the **student** persona, append after the completion summary:

> Why this step? A bug fix that ships without a regression test is a bug fix that comes back. The reproducer + failing test + smallest diff pattern makes the fix's evidence permanent - the next developer (or you, six months later) reads the test and sees exactly what "broken" meant.

---

## What NOT to do

- Do not proceed without a reproduction recipe.
- Do not skip the failing-then-passing regression test.
- Do not permit refactors or unrelated improvements inside a bug-fix diff.
- Do not update `claude/context.md`, `claude/features.md`, `claude/design-decisions.md`, or `claude/learnings.md` from this skill - only `CHANGELOG.md`.
- Do not investigate more than one bug per invocation.
