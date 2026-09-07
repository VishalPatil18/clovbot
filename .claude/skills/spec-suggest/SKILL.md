---
name: spec-suggest
description: Surface high-leverage improvement suggestions across the codebase, architecture, and design. Use when the user asks "what should we improve", "any suggestions", "where's the low-hanging fruit", "what would you change", or invokes `/spec-suggest`. Ranks suggestions by leverage (impact vs effort), grounds each in evidence from the repo and memory layer, and never rewrites code without approval.
---

# spec-suggest

Propose what to improve, ranked by leverage. This skill is advisory - it produces a prioritized list with rationale, not edits. Turning a suggestion into work goes through the normal skills (`/spec-feature`, `/spec-refactor`, `/spec-bug`) after the user picks.

The trap to avoid is a long flat list of generic advice. A few high-leverage, evidence-backed suggestions beat twenty platitudes.

---

## Read first

- `claude/context.md` **Current State** + **Open Questions / TODOs** - existing known gaps are the first source of suggestions.
- `claude/srs.md` success metric and constraints - the best suggestions move the metric or reduce a real risk.
- The area named by the request. If none is named, scan the memory layer's open items first before reading code broadly.

## Method

### Step 1 - Gather evidence, not opinions

A suggestion needs a hook: an actual smell, a failing/absent test, an unaddressed TODO, a slow path, a security gap, a drifted doc, a risky dependency. If you cannot point to evidence, it is not a suggestion - it is a preference.

### Step 2 - Score by leverage

For each candidate: **impact** (how much it moves the metric / reduces risk) against **effort** (how much work and how reversible). Rank high-impact/low-effort first. Explicitly separate:

- **Now** - high leverage, cheap, low risk. Do these next.
- **Soon** - worth it, larger effort or some risk.
- **Later / watch** - real but low priority, or needs more information.

### Step 3 - Make each suggestion actionable

State each as: _observation (evidence) -> suggested change -> expected benefit -> which skill would carry it out_. A suggestion the reader cannot act on is noise.

## What to look for (in leverage order)

1. **Correctness / security risks** - unhandled error paths, missing authz, unvalidated input.
2. **Reliability gaps** - missing tests on load-bearing behavior, flaky tests, no rollback.
3. **Change-cost problems** - a shared module bloated with feature logic, a near-duplicate helper, a file past a healthy size.
4. **Performance** - only with a plausible hot path; defer to `/spec-performance` to confirm with numbers.
5. **Consistency / docs drift** - the memory layer or README no longer matches the code (hand to `/spec-docs`/`/spec-sync`).

## Discipline

- **Do not edit.** Recommend; let the user choose; then use the owning skill.
- **Respect the zero-cost and simplicity constraints** - do not suggest a paid service or a speculative abstraction.
- **Do not pad the list.** Stop when the leverage drops off.

## Output and memory

- Present a ranked table: _suggestion -> evidence -> impact/effort -> owning skill_.
- Offer to record the accepted ones in `claude/context.md` **Open Questions / TODOs** so they are tracked, not forgotten.

## Red flags

- Generic advice with no evidence from this repo ("add more tests", "improve performance").
- A flat unranked list; no impact/effort distinction.
- Suggestions that silently assume a paid dependency or a rewrite.
- Editing code under the guise of "suggesting".
