---
name: spec-docs
description: Run an isolated documentation rewrite workflow. Use when the user says "update the docs", "the README is stale", "reconcile the docs against the code", or invokes `/spec-docs`. Reads the current repo state and reconciles it against claude/context.md, claude/features.md, and README.md (FR-DOCS-01). Produces a diff for approval (FR-DOCS-02). Refuses to modify source code (FR-DOCS-03). Flags any documented feature that no longer exists in the codebase (FR-DOCS-04).
---

# spec-docs

Reconcile the project's documentation against the current codebase (SRS §5.4). Docs only. No source code. Ever.

The skill's job is to keep the documentation honest: catch stale entries, add missing ones, remove ghosts (features documented but no longer implemented), and never accidentally slip a source-code edit into a "docs pass."

---

## Step 1 - Read the repo state and the memory layer (FR-DOCS-01)

Load, in this order:

1. `claude/context.md` - the compressed snapshot of what exists.
2. `claude/features.md` - the append-only log of shipped features.
3. `README.md` - what the outside world sees.
4. The actual repo tree (top-level directories, top-level files).

For a small project, also skim any secondary docs mentioned in `README.md` (`CONTRIBUTING.md`, `SECURITY.md`, `docs/`).

---

## Step 2 - Reconcile

Build three lists:

1. **In docs, in code** - documentation matches reality. No action.
2. **In code, not in docs** - shipped features or capabilities the docs do not mention.
3. **In docs, not in code** - documented features that no longer exist in the codebase (FR-DOCS-04).

For each item in list 2, propose an addition to the appropriate doc file. For each item in list 3, propose either removal or a "deprecated" note.

**Do not** propose changes to source code even if you notice something during reconciliation. Note it in a footer and hand it to `/spec-refactor` or `/spec-bug` afterwards.

---

## Step 3 - Produce a diff for approval (FR-DOCS-02)

Emit a unified-diff-style summary of proposed changes:

```text
PROPOSED DOC CHANGES:

README.md:
+ ## Feature: OAuth login (shipped 2026-06-15, previously undocumented)
- ## Feature: LDAP integration (removed 2026-05-20, still in README)

claude/context.md:
+ Current stage bumped to Stage 7 (was Stage 6)

STALE FEATURES FLAGGED FOR REVIEW:
- {feature name}: documented in features.md but no matching code found via grep for {symbol}.

SOURCE-CODE ISSUES NOTICED (not fixed by this skill):
- {path}: {note} - handle via /spec-refactor or /spec-bug.
```

**Wait for user approval** before applying any change.

---

## Step 4 - Apply only after approval

On approval, dispatch the **spec-doc-writer** sub-agent to write the approved changes.

**Source code is out of scope for this skill.** If the diff you produced accidentally touches a file under `src/`, `packages/`, or any code path, refuse to apply it and start over. This is the FR-DOCS-03 refusal gate.

Emit the refusal in this form:

> Cannot apply: proposed diff includes source-code changes at {path list}. This skill is docs-only. Please re-run /spec-docs after routing those changes through /spec-refactor or /spec-bug.

---

## Completion summary (NFR-USE-01)

When the doc updates are written, print exactly one line summarising and a one-line next-step hint:

> Reconciled docs: {N} additions, {M} removals, {K} stale features flagged. Next: address the flagged features via `/spec-refactor` or, if they should stay documented as historical, add a "removed in v{X}" note.

---

## Student persona note (NFR-USE-03)

If `CLAUDE.md` is scaffolded for the **student** persona, append after the completion summary:

> Why this step? Docs drift silently. Nobody wakes up planning to leave stale README entries around; it just happens as features ship and no one owns the reconciliation. Running this skill periodically keeps the drift from compounding into a documentation-vs-reality gap that new contributors trip on.

---

## What NOT to do

- Do not modify any file under a source path (`src/`, `packages/`, `lib/`, etc.).
- Do not silently apply changes; always present the diff first.
- Do not skip flagging stale features - the flag is the whole point.
- Do not run the test suite or `spec-coder` from this skill.
- Do not invoke sub-agents other than `spec-doc-writer`.
