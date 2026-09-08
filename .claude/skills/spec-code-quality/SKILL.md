---
name: spec-code-quality
description: Write and review maintainable, correct code, and run a simplification pass. Use when writing new modules, cleaning up code, naming, handling errors, reducing complexity, or when the user says "clean this up", "code quality", "simplify this", "is this good code", "best practices", or invokes `/spec-code-quality`. One measure governs everything: how fast can the next person change this code without breaking it.
---

# spec-code-quality

Code quality is not aesthetics. It is one measurable thing: **how fast can the next person (human or AI) change this code without breaking it?** Every rule below serves that. This skill both raises quality on code you write and runs a dedicated **simplify pass** on code you touch.

Scope discipline: apply only to the code in the current change or the files named. Leave the campsite cleaner, but stay in the campsite - do not turn a 10-line fix into a 500-line renovation.

---

## Read first

- `claude/context.md` **Current State** - the conventions this code must match. Consistency with the codebase beats a "better" pattern that fights it.
- The specific files named by the request. Nothing speculative.

## The hierarchy - when rules conflict, higher wins

1. **Correct** - handles the real input space: empty, null, duplicate, concurrent, huge, malformed.
2. **Honest** - names, types, and structure tell the truth. No function named `validate` that also saves.
3. **Changeable** - the next likely change touches one place.
4. **Consistent** - matches the surrounding code.
5. **Small / clever / fast** - last, and only with evidence it matters.

## Writing rules

### Shape

- Functions do one thing at one level of abstraction - name it accurately without "and". Length is a symptom, not the rule: a 40-line straight-line function beats 5 fragmented ones you must chase.
- Depth over surface: prefer few functions with real behavior over layers of one-line delegation.
- Data shapes beat control flow: a lookup table, an exhaustive enum match, or a well-typed state object usually deletes bugs. Make illegal states unrepresentable where the type system allows.

### Names

- Names carry the spec: `retry_delay_seconds` not `delay`; `is_eligible_for_credit` not `check`. If a good name is impossible, the abstraction is wrong.
- Booleans read as assertions (`is_`, `has_`, `can_`); functions are verbs; avoid negated booleans that force double negation.

### Errors - where most quality issues actually live

- Handle or propagate, never swallow. An empty catch is a bug with extra steps.
- Fail fast at boundaries: validate inputs where they enter, then the interior trusts them.
- Messages state what failed, with what input, and what the caller can do.
- Distinguish expected failures (user error -> typed result, clean message) from bugs (invariant broken -> crash loudly). Converting bugs into handled errors hides them.

### State and dependencies

- Minimize mutable state and its scope. Global mutable state is guilty until proven innocent.
- Side effects at the edges; the core computes. A function that computes AND writes AND notifies is three functions wearing a trenchcoat.
- Take dependencies explicitly (parameters/constructor), not from globals - this is what makes code testable without patching.

## The simplify pass

When asked to simplify, hunt for these and propose the smaller version:

- A chain of conditionals -> a typed model or a dispatch table.
- Duplicate branches -> one clearer flow.
- A pass-through wrapper that adds indirection without clarifying the API -> delete it.
- Gratuitous `any`/`unknown`/casts and silent fallbacks -> make the type boundary explicit; downstream branching often disappears.
- 1000 lines where 100 suffice -> rewrite. Prefer deleting an abstraction to polishing it.

## Duplication - the nuanced rule

Duplication is cheaper than the wrong abstraction. Extract when copies must change together _for the same reason_ (shared business rule); keep copies that merely look alike today. Rule of three: tolerate two, refactor at three - and extract the concept, not the coincidence.

## Refactoring discipline

- Never mix refactoring and behavior change in one commit - reviewers can verify "no behavior change" or "this change", not both.
- Refactor with a safety net (tests or a golden-path check), in steps that each keep the build green.

## Output and memory

- Report defects as: _input -> wrong behavior -> consequence_, ranked by severity; style nits last, batched, never blocking correctness.
- When you simplify, state what was removed and why the behavior is unchanged.
- Log any non-obvious quality decision to `claude/learnings.md`.

## Red flags

- A catch block that logs and continues on a bug; broad `except`/`catch` hiding corruption.
- Names like `data`, `tmp`, `handle`, `process` with no context.
- An abstraction with one caller; a "temporary" branch bolted onto an unrelated flow.
- A refactor commit that also changes behavior.
