---
name: spec-plan
description: Build claude/plan.md with 8-10 staged deliverables. Use when the user says "let's plan the build", "break this into stages", or invokes `/spec-plan`. Enforces FR-PLAN-01..05: refuses to proceed when srs.md has unresolved open questions in load-bearing categories, requires 8-10 stages, and produces a checklist Claude flips during execution with per-stage goal, scope, acceptance criteria, test plan, and effort band.
---

# spec-plan

Decompose the project into 8-10 stages and write them to `claude/plan.md`. Run this after `/spec-requirements` and `/spec-design`.

Every stage MUST end with a standalone, testable, runnable deliverable (FR-PLAN-02). No stage is allowed to be "we'll integrate it in the next one" - each stage must stand on its own.

---

## Step 1 - Read the SRS and refuse if incomplete (FR-PLAN-05)

Before proposing any stages:

- Read `claude/srs.md` in full.
- Read the Open Questions checklist at the bottom.
- Classify each open question as **load-bearing** or **incidental**.

A question is **load-bearing** if answering it changes stage boundaries, sequencing, or scope. Examples:

- "Do we support offline mode in v1?" - load-bearing (changes stage count).
- "What color should the primary button be?" - incidental (stays open).

If ANY load-bearing question is still unchecked, **refuse to proceed** with a message of this form:

> Cannot generate plan yet: srs.md has unresolved load-bearing open questions:
>
> - {question 1}
> - {question 2}
>
> Answer these first by editing srs.md or re-running /spec-requirements. Incidental questions can stay open.

Do not paper over load-bearing gaps with placeholder stages.

---

## Step 2 - Decompose into 8-10 stages (FR-PLAN-01, FR-PLAN-02)

Read `claude/srs.md`'s Functional Requirements and Non-Functional Requirements. Group them into 8, 9, or 10 stages such that:

- Each stage ships a standalone, testable, runnable deliverable.
- Stages progress from foundation to features to release.
- The last stage is always a cross-platform verification + release stage.
- No stage depends on unshipped scope from a later stage.

Effort bands:

- **S** ≤ 1 day of focused work.
- **M** 2-4 days.
- **L** 5+ days.

Sum the estimates. If the total exceeds what feels reasonable for the project, propose combining or splitting stages until it fits without breaking the standalone-deliverable rule.

---

## Step 3 - Write `claude/plan.md` (FR-PLAN-03)

Use the template at `templates/claude/plan.md` as the skeleton. For each stage produce:

- **Goal** - one sentence.
- **Scope-in** - bullet list of what is included.
- **Scope-out** - bullet list of what is deliberately excluded (usually names later stages that own it).
- **Acceptance criteria** - checkbox list, each item independently verifiable.
- **Test plan** - unit / integration / manual approach in one paragraph or a short bulleted breakdown.
- **Effort** - one of S / M / L.
- **Exit signal** - one sentence describing the observable signal that the stage is done.

Use `- [ ]` for every checkbox. Downstream execution flips them to `- [x]` (FR-PLAN-04).

Prepend the plan with a small Stage Map table (`| # | Stage | Deliverable | Effort |`) so the whole build is legible at a glance.

---

## Step 4 - Cross-cutting risks

At the bottom of `plan.md`, include a **Cross-Cutting Risks** table pulled from `srs.md`'s risks section, mapping each risk to the stage(s) that mitigate it. This is how future work verifies that no risk is silently orphaned.

---

## Confirmation gate

Before finalising `plan.md`, present the Stage Map to the user and ask exactly:

> Reply `proceed`, `modify: <changes>`, or specific stage feedback to advance.

Do not write the full plan until the shape is approved. Then flip to full write mode.

---

## Completion summary (NFR-USE-01)

When `claude/plan.md` is written, print one line summarising and a one-line next-step hint:

> Wrote claude/plan.md ({N} stages, {sum S/M/L} effort). Next: run `/spec-feature` to enter the 6-phase cycle for Stage 1.

---

## Student persona note (NFR-USE-03)

If the project's `CLAUDE.md` is scaffolded for the **student** persona, append after the completion summary:

> Why this step? Turning a spec into a build plan forces you to decide what "shippable" means at each step. Small, standalone deliverables are how you keep momentum when a feature turns out harder than expected - you always have something working to fall back on.

---

## What NOT to do

- Do not propose more than 10 or fewer than 8 stages without an explicit user override.
- Do not create stages whose acceptance criteria depend on scope shipped in later stages.
- Do not skip the load-bearing open-questions refusal gate.
- Do not write code - only the plan file.
- Do not modify `srs.md` or `design.md` while running this skill.
