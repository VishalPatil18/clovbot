---
name: spec-resume
description: Resume work that was interrupted - crash, network drop, context loss, or usage limits reached - from a persisted resumption brief. Use when the user says "resume", "where were we", "pick up where we left off", "continue the last task", "I got cut off", or invokes `/spec-resume`. Restores context from `claude/resume.md` and the memory layer, leads with the next action, and never redoes completed work.
---

# spec-resume

Pick up interrupted work without losing context or redoing finished steps. A long task can be cut short by a crash, a dropped connection, a lost context window, or hitting usage limits. This skill restores the thread from a durable **resumption brief** - "here is where work stopped, and what happens next" - so the next session continues instead of restarting.

Inspired by the resumption-brief pattern: a small, reviewable continuity record, not a database. It lives in the file-based memory layer this kit already uses - zero extra infrastructure.

---

## Two operations

### Save a checkpoint (call before a risky/long stretch, or when told "save progress")

Write or update `claude/resume.md` with a compact brief:

```markdown
# Resume Brief - <task title>

**Updated:** <ISO datetime>
**Active skill / phase:** <e.g. /spec-feature, Tech Specs phase>

## Goal

<one or two lines: what this task is trying to achieve>

## Done so far

- <completed step> (verified: <how>)

## Next action

<the single next concrete step to take on resume>

## Open loops / blockers

- <waiting-on, unresolved question, or failure to retry>

## Files in flight

- `<path>` - <what is half-done here>
```

Keep it short and current - a stale brief is worse than none. One writer at a time; overwrite the same file.

### Resume (the default operation)

1. **Read the brief first.** Load `claude/resume.md` if it exists. Then read `claude/context.md` **Current State** + the most recent Session History entry, and the relevant `claude/features.md` entry - the same memory the rest of the kit relies on.
2. **Reconstruct state, do not assume it.** Confirm which "Done so far" steps are actually reflected on disk (check the files in flight, run the tests). Trust the repo over the brief when they disagree, and say so.
3. **Lead with the next action.** Open the response by restating the goal in one line and the single next step - do not re-explain the whole history.
4. **Continue, do not restart.** Skip completed, verified steps. Re-verify only what the interruption could have corrupted (a half-written file, an uncommitted change, a partial migration).
5. **Update the brief as you go**, and clear it when the task completes so a stale brief never misleads the next session.

## Guardrails

- **Never redo verified work.** If "Done so far" says a step passed and the repo confirms it, move on.
- **Surface uncertainty.** If the interruption left something in an unknown state (a migration that may have half-applied, a push that may not have landed), say so and verify before proceeding - do not guess.
- **No new infrastructure.** The brief is a markdown file; do not introduce a database, queue, or service to track state.
- If no brief and no relevant Session History exist, say so and ask for the goal rather than inventing one.

## Output and memory

- On resume: one-line goal, the next action, then continue the owning skill's workflow.
- Keep `claude/resume.md` current during long work; delete it (or mark it complete) when done, and fold the outcome into `claude/context.md` Session History.

## Red flags

- Re-running completed steps because the brief was not consulted.
- Trusting a stale brief over the actual repo state.
- Proceeding past a half-applied migration or an ambiguous push without verifying.
- Spinning up a database/service to store what a markdown file holds.
