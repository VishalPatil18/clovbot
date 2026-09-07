---
name: spec-review
description: Multi-axis code review with quality gates - modes for code, PR, frontend, backend, and comments. Use before merging any change, when reviewing code written by yourself/another agent/a human, or when the user says "review this", "review the PR", "review the frontend/backend", "check my comments", or invokes `/spec-review`. Reviews correctness, readability, architecture, security, and performance; labels every finding by severity; reviews only the changed diff.
---

# spec-review

Review a change before it merges. One skill, several **modes** - pass the mode as the argument:

- `/spec-review code` (default) - full five-axis review of a diff.
- `/spec-review pr` - the same, framed for a whole pull request: description quality, change size, commit hygiene.
- `/spec-review frontend` - five axes plus the frontend checklist below.
- `/spec-review backend` - five axes plus the backend checklist below.
- `/spec-review comments` - review **and rewrite** code comments (see that section).

**Approval standard:** approve when the change definitely improves overall code health, even if imperfect. Do not block because it is not how you would have written it. If it improves the codebase and follows project conventions, approve.

---

## Read first

- The **diff only** (`git diff` for the change under review) - not the whole repo.
- `claude/context.md` **Current State** for conventions the change must match, and the relevant `claude/features.md` entry for what the change was supposed to do.
- `claude/srs.md` only for the requirement the change claims to satisfy.

## Process

1. **Understand intent.** What is this change for? What spec/feature does it implement? Review the tests first - they reveal intent and coverage.
2. **Walk the five axes** over each changed file.
3. **Categorize and rank** every finding (table below). Lead with what matters.

## The five axes

1. **Correctness** - Does it match the requirement? Are edge cases (null, empty, boundary, duplicate, concurrent) handled? Are error paths handled, not just the happy path? Do tests actually catch a regression?
2. **Readability & simplicity** - Clear, convention-consistent names (no bare `temp`/`data`/`result`)? Straightforward control flow? Could this be fewer lines? Are abstractions earning their complexity (do not generalize before the third use)? Is a new conditional bolted onto an unrelated flow - a design smell, not a nit?
3. **Architecture** - Does it follow existing patterns or justify a new one? Does the refactor _reduce_ concepts a reader must hold, or just relocate complexity? Is feature-specific logic leaking into a shared module? Reuse the canonical helper, not a near-duplicate.
4. **Security** - Input validated at boundaries? Queries parameterized? Output encoded? Secrets out of code/logs? Authz checked? External/LLM data treated as untrusted? For depth, run `/spec-security`.
5. **Performance** - N+1 queries? Unbounded loops or fetches? Missing pagination? Unnecessary re-renders? For depth, run `/spec-performance`.

## Severity labels (put one on every finding)

| Prefix                        | Meaning                                   | Author action                |
| ----------------------------- | ----------------------------------------- | ---------------------------- |
| **Critical:**                 | Security hole, data loss, broken function | Must fix before merge        |
| _(no prefix)_                 | Required change                           | Must address before merge    |
| **Consider:** / **Optional:** | Suggestion                                | Worth weighing, not required |
| **Nit:**                      | Style/formatting                          | May ignore                   |
| **FYI**                       | Informational                             | No action                    |

Report each as: _location -> problem -> consequence_. A few high-conviction findings beat a long list of nits. If there is one structural problem and ten nits, the structural problem **is** the review.

## Change sizing

`~100 lines` reviewable in one sitting; `~300` acceptable for one logical change; `~1000` too large - ask the author to split (stack, by file-group, horizontal, or vertical slices). Separate refactoring from feature work - they are two changes. Watch total file size too: a small diff can still push a file past ~1000 lines - decompose first, then add.

## Frontend checklist (frontend mode)

- [ ] No unnecessary re-renders (stable prop references, `memo`/`useMemo` only where measured).
- [ ] Accessibility basics: keyboard reachable, labels, focus management, contrast. For depth run `/spec-ux`.
- [ ] No layout shift (images have dimensions); bundle impact considered for new deps.
- [ ] State lives at the right level; no derived state duplicated in `useState`.

## Backend checklist (backend mode)

- [ ] Input validated at the route boundary; the interior trusts its inputs.
- [ ] Authorization (not just authentication) checked on every protected path.
- [ ] Queries parameterized; no N+1; list endpoints paginated.
- [ ] Errors handled or propagated - never swallowed; messages state what failed and what the caller can do.
- [ ] Transaction boundary = one use case; side effects at the edges.

## Comments mode (review and rewrite)

Comments explain **why**, never **what**. In this mode:

- Delete comments that restate the code, and commented-out code (git remembers).
- Rewrite verbose comments to one crisp line naming the constraint, reason, or link to the decision.
- Flag any comment that is now a lie (drifted from the code) and correct it.
- Add a `why`-comment only where intent is non-obvious. Prefer renaming the code over adding a what-comment.

## Verdict and memory

- **Approve** (ready) or **Request changes** (issues listed by severity).
- After a review that drives edits, confirm the changed files still match the requirement.
- Note any deferred finding in `claude/context.md` **Open Questions / TODOs** so it is not lost.

## Red flags

- "LGTM" with no evidence of review; a review that only checks tests pass.
- All feedback unlabeled, so required vs optional is unclear.
- A refactor that moves code without reducing concepts; feature logic added to a shared module.
- A bug-fix PR with no regression test.
