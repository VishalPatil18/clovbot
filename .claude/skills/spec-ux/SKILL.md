---
name: spec-ux
description: Review user experience and accessibility - usability, flows, states, and WCAG basics. Use when reviewing a UI, when a flow feels clunky, before shipping a user-facing feature, or when the user says "review the UX", "usability", "is this accessible", "improve the user experience", or invokes `/spec-ux`. Grounds every finding in the SRS's target users and jobs-to-be-done, and treats accessibility as a requirement, not a nice-to-have.
---

# spec-ux

Review the experience the user actually gets. UX is not decoration - it is whether the target user can complete their job without confusion, error, or exclusion. Judge against who the SRS says the users are, not personal taste.

For visual design tokens and component systems use `/spec-design`; this skill reviews usability, flows, and accessibility of what is built.

---

## Read first

- `claude/srs.md` - the target users, their jobs-to-be-done, and the success metric. Every finding ties back to one of these.
- `design/design.md` - the intended design system, so you flag drift, not restyle from scratch.
- The screens/components named by the request.

## Usability review

### Flows

- Can the target user complete the core job? Walk the primary flow step by step and count the friction points.
- Is the happy path the shortest path? Are required actions obvious and destructive ones guarded?
- Does every screen answer: where am I, what can I do, what happens next?

### The four states of every data view

Check each - missing states are the most common UX defect:

- **Empty** - first-run/no-data, with a next action (not a blank void).
- **Loading** - skeleton or progress, no layout jump when data lands.
- **Error** - a human message that says what failed and how to recover, not a raw stack.
- **Ideal/populated** - the normal case.

### Feedback and forms

- Every action has immediate feedback (optimistic update, spinner, toast).
- Form errors are specific, inline, and tied to the field; validation fires at the right time (not on every keystroke, not only on submit).
- Labels are real labels; placeholder text is not a label.

## Accessibility (WCAG 2.1 AA - a requirement, not optional)

- [ ] Every interactive element is keyboard reachable and operable; focus order is logical; focus is visible.
- [ ] Focus is trapped and restored correctly for modals/dialogs.
- [ ] Text contrast >= 4.5:1 (>= 3:1 for large text and UI boundaries).
- [ ] Images have alt text; icons-as-buttons have accessible names.
- [ ] Content and structure are conveyed to a screen reader (semantic elements, landmarks, ARIA only where semantics fall short).
- [ ] Nothing conveys meaning by color alone; motion respects `prefers-reduced-motion`.
- [ ] Forms: inputs have associated labels; errors are announced.

Verify with keyboard-only navigation and an automated pass (axe/Lighthouse) - automated tools catch ~30%, so the manual keyboard walk is not optional.

## Output and memory

- Report findings as: _user + job -> friction or barrier -> impact on the success metric_, ranked by how many users hit it and how badly.
- Separate **blocks the job** (must fix) from **slows the job** (should fix) from **polish** (nice).
- Log recurring UX decisions in `claude/design-decisions.md` so the pattern is reused, not re-litigated.

## Red flags

- A data view with only the populated state - no empty, loading, or error design.
- Anything reachable by mouse but not keyboard; a modal that loses or traps focus wrong.
- Color-only status; contrast below AA; placeholder used as the only label.
- Error messages that expose internals or give the user no way forward.
