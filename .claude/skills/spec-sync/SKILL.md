---
name: spec-sync
description: Reconcile claude/context.md against the actual repo state and compress any memory file that has grown past the 1,500-line budget (NFR-PERF-03). Use when the user says "sync the memory files", "context.md drifted", "compress the memory", or invokes `/spec-sync`. Detects drift, proposes corrections, compresses oversized files while preserving a `compressed-from` audit trail, and refuses to lose history.
---

# spec-sync

Keep the memory layer honest and within budget (SRS §5.5, NFR-PERF-03). Two responsibilities: **drift reconciliation** (does `claude/context.md` still describe the repo?) and **compression** (has any memory file grown past 1,500 lines?).

Both are surgical. The skill does not touch source code. It does not summarize history away. When it compresses, it leaves an audit trail so the compression is reversible from git.

---

## Step 1 - Drift check on `claude/context.md`

Load `claude/context.md`'s **Current State** section. Check each field against the actual repo:

- **Stage** - matches the checkbox state in `claude/plan.md`?
- **Repo layout** - the paths listed still exist? New top-level directories missing from the list?
- **Build / run / test commands** - do the commands actually exist in `package.json` scripts / `pyproject.toml` scripts / equivalent?

For each mismatch, propose a specific edit. Present the list to the user before applying anything.

Example output:

```text
DRIFT DETECTED:

Current State says: "Stage 6 complete"
Reality: claude/plan.md shows Stage 7 also checked.
Proposed: bump "Stage" to "Stage 7 complete - Maintenance Skills."

Current State lists: `packages/cli-node/`
Reality: also has `packages/cli-python/` (missing from list).
Proposed: add `packages/cli-python/` to Repo layout.
```

---

## Step 2 - Compression check (NFR-PERF-03)

For each memory file under `claude/`, count lines. If any exceeds **1,500 lines**, propose a compression pass. The candidates are usually `claude/context.md` (Session History grows unbounded) and `claude/features.md` (feature log).

Compression rules:

1. **Never delete the file.** Rename the current version and leave the compressed version in its place.
2. **Preserve the audit trail.** The compressed file MUST begin with a `compressed-from` block:

   ```markdown
   > **Compressed from {N} lines on {YYYY-MM-DD} by /spec-sync.**
   > Full history preserved in git; see `git log --follow -p {path}` for the pre-compression version.
   > The last {K} Session History entries are kept verbatim below; older entries were folded into a summary block.
   ```

3. **Retain recency verbatim.** The most recent 2-3 Session History entries (or Feature entries) survive without alteration. Older entries get summarized into a single "Historical Session Summary" block that captures major decisions but not day-by-day narration.
4. **Never edit past entries.** Compression is different from mutation. Old entries move to git; they are not rewritten.

Present the compression plan and wait for approval before applying.

---

## Step 3 - Apply changes

On approval:

1. Dispatch the **spec-doc-writer** sub-agent to write the reconciled `claude/context.md` and any compressed files.
2. Confirm the compressed-from block is present in every file touched.
3. Re-run the drift check to confirm zero mismatches remain.

---

## Refusal cases

- **No drift, no oversized files.** Emit: "Nothing to sync. Memory layer is within budget and matches the repo." Exit successfully.
- **Compression would lose history not preserved in git.** If the target file is untracked or has uncommitted changes, refuse:

  > Cannot compress {path}: file has uncommitted changes. Commit the current state first so the pre-compression version is recoverable from git.

- **Drift proposal touches source code.** Refuse - this skill is memory-only.

---

## Completion summary (NFR-USE-01)

When sync finishes, print exactly one line summarising and a one-line next-step hint:

> Synced memory: {N} drift fixes, {M} files compressed (compressed-from audit trail written). Next: continue with the current feature cycle or `/spec-docs` if the external docs also need a pass.

---

## Student persona note (NFR-USE-03)

If `CLAUDE.md` is scaffolded for the **student** persona, append after the completion summary:

> Why this step? Memory files exist to save tokens on every future prompt - but only if they stay accurate and stay under budget. `/spec-sync` is the checkup: it catches the case where the file says "Stage 6" but reality is Stage 8, and it prevents the Session History from growing into a 5,000-line log that costs more to read than it saves.

---

## What NOT to do

- Do not compress a file that has uncommitted changes - history could be lost.
- Do not rewrite past Session History or Feature entries. Compression retains recency and summarizes older material; it does not edit history in place.
- Do not touch source code. This skill is memory-only.
- Do not skip the `compressed-from` audit block. Reversibility is the whole point.
- Do not invoke sub-agents other than `spec-doc-writer`.
