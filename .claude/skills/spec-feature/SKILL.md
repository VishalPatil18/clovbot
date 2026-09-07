---
name: spec-feature
description: Run one full 6-phase feature development cycle. Use when the user says "let's build a feature", "add feature X", "start the next feature", or invokes `/spec-feature`. Orchestrates Requirements → Architecting → Product Specs → Tech Specs → Planning → Writing Code, delegating each phase to the appropriate sub-agent, refusing to skip phases without an explicit `--skip <phase>` override logged in claude/design-decisions.md, and updating the memory layer at the end in the exact order context.md → features.md → design-decisions.md → learnings.md → CHANGELOG.md.
---

# spec-feature

Run the full 6-phase feature development cycle for ONE feature. Every phase must complete before the next begins.

Use the phase-specific sub-agents (`spec-interrogator`, `spec-architect`, `spec-planner`, `spec-coder`, `spec-refactorer`, `spec-doc-writer`) - they exist because each phase has a different tool-scope and a different failure mode.

---

## The six phases (SRS §3.5)

Execute in this order. **Do not skip** unless the user passes an explicit `--skip <phase>` flag AND you have written the override into `claude/design-decisions.md` (see the refusal clause below).

### Phase 1 - Requirements

Dispatch the **spec-interrogator** agent. Its job is to cross-question the user until every ambiguity is resolved.

Append the interrogation transcript summary to `claude/features.md` under a new `## Feature: <name>` heading. Do not proceed to Phase 2 while any question is still open.

### Phase 2 - Architecting

Dispatch the **spec-architect** agent. It MUST return at least two options with tradeoffs. Present both to the user, take their choice, and record the choice and rationale in `claude/design-decisions.md` under a new `## Decision - <title>` entry.

### Phase 3 - Product Specs

Write the product spec into `claude/features.md` under the current feature heading. Cover:

- UI sketches (ASCII or link to a design file).
- UX flow (step by step, one line each).
- Frontend entities.
- Backend entities.
- DB schema (tables/collections with column names and types).

### Phase 4 - Tech Specs

Add a Tech Specs block to the same `claude/features.md` section. Cover:

- Framework (chosen + rejected alternatives with one-line reason).
- Language.
- Deployment target.
- Data store (chosen + rejected alternatives).

Each rejected alternative gets a one-line reason. Log any non-obvious tech decision to `claude/design-decisions.md`.

### Phase 5 - Planning

Dispatch the **spec-planner** agent. Get back a multi-stage execution plan with per-stage acceptance criteria. Append the plan to the `claude/features.md` section under Phase 5.

### Phase 6 - Writing Code

Before writing code, re-read `CLAUDE.md`, `claude/context.md`, and this feature's `claude/features.md` section (FR-CODE-01).

For each stage in the Phase 5 plan:

1. Dispatch **spec-coder**. It implements the stage, writes tests for every behavior introduced (FR-CODE-03), and runs the verification suite.
2. If any design decision inside the stage is ambiguous, spec-coder MUST stop and cross-question (FR-CODE-02) - do not let it guess.
3. When the stage completes, dispatch **spec-refactorer** with the diff-scoped file list. It cleans only the files this stage touched (FR-CODE-04).

When ALL stages complete, dispatch **spec-doc-writer** to update the memory layer in the prescribed order:

```text
1. claude/context.md
2. claude/features.md
3. claude/design-decisions.md
4. claude/learnings.md   (if Student persona)
5. CHANGELOG.md
```

This order is FR-CODE-05 and is not negotiable. The spec-doc-writer agent already enforces it.

---

## Refusal-to-skip clause (FR-FEATURE)

**You may not skip a phase.** If the user asks to skip one (e.g. "skip Product Specs"), refuse unless they pass an explicit `--skip <phase>` argument. When they do:

1. Ask for a written reason ("Why skip Product Specs?").
2. Append a new entry to `claude/design-decisions.md`:

   ```markdown
   ## Decision - Skipped Phase {N} in feature "{name}"

   | Field         | Value                     |
   | ------------- | ------------------------- |
   | Date          | {today}                   |
   | Feature       | {name}                    |
   | Skipped phase | {name}                    |
   | Reason        | {user's reason, verbatim} |
   ```

3. Proceed only after the entry is written.

The refusal exists because skipping phases is what causes the workflow to silently degrade. The override + audit trail preserves accountability.

---

## Completion summary (NFR-USE-01)

When Phase 6 finishes and the memory layer is updated, print exactly one line summarising and a one-line next-step hint:

> Shipped feature "{name}" ({N stages}, {M files changed}, {K tests added}). Next: run `/spec-feature` for the next feature or `/spec-plan` if the build plan needs revising.

---

## Student persona note (NFR-USE-03)

If `CLAUDE.md` is scaffolded for the **student** persona, append after the completion summary:

> Why this step? Six phases feels like a lot for one feature. It is - and that's the point. Each phase closes a different way a project can silently drift: unclear requirements, wrong architecture, missing entities, wrong stack, unbounded scope, unrecorded decisions. Skipping one moves the failure to code review or, worse, production.

---

## What NOT to do

- Do not skip phases without `--skip <phase>` AND the design-decisions.md entry.
- Do not update the memory layer in any order other than the FR-CODE-05 order.
- Do not let spec-coder guess through ambiguity - re-invoke spec-interrogator.
- Do not run spec-refactorer against the whole repo - only the current cycle's diff.
- Do not touch `claude/srs.md`, `claude/plan.md`, or `design/design.md` - those belong to `/spec-requirements`, `/spec-plan`, and `/spec-design`.
