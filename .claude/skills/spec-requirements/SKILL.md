---
name: spec-requirements
description: Build claude/srs.md via structured cross-questioning. Use when the user says "let's write the SRS", "gather requirements", "I have an idea for a project", or invokes `/spec-requirements`. Enforces FR-REQ-01..05: at least three cross-questioning rounds covering five mandatory categories, refuses to write srs.md while any category is empty, produces the canonical srs.md section list, and tracks unresolved questions as a checklist.
---

# spec-requirements

Build `claude/srs.md` for this project by cross-questioning the user until every mandatory category has a concrete answer. Then write the SRS in the canonical shape and hand off to `/spec-design`.

Skip nothing. The gates below exist because unspecified requirements cause the wrong software to get built.

---

## The five mandatory categories (FR-REQ-02)

Cross-questioning MUST cover all five before any SRS text is written:

1. **Target users** - who is this for, in one sentence per persona, with the primary need each has.
2. **Jobs-to-be-done** - what does the user hire this product to do, phrased as verbs.
3. **Primary success metric** - a single sentence describing how we will know the product worked.
4. **Hard constraints** - technical, regulatory, business, or budget constraints that cannot be negotiated.
5. **Explicit non-goals** - what this project is deliberately NOT trying to do in v1.

Track each category's state internally as one of: **empty**, **partial**, **filled**. Do not proceed to writing until all five are **filled** (FR-REQ-03).

---

## Cross-questioning protocol (FR-REQ-01)

Conduct **at least three rounds** of cross-questioning. A round is one message from you containing questions, followed by one reply from the user.

- **Round 1** - open discovery. Ask the user to describe the product in their own words. From their answer, populate whatever categories are naturally covered and flag the ones still empty.
- **Round 2** - fill the gaps. Ask targeted questions for every category still marked empty or partial. Batch questions; do not drip them.
- **Round 3+** - pressure-test. For each answer, ask "what would falsify this?" or "what is the smallest surprise that would make this wrong?" Escalate rounds as needed until every category is filled.

If a category remains empty after Round 3, **refuse to proceed** with a message of the form:

> Cannot write srs.md yet: the following categories are still empty: {category list}. Please answer the questions above before we continue.

Do not paper over the gap with placeholders. The refusal is the mechanism that makes the workflow trustworthy (FR-REQ-03).

---

## Writing `claude/srs.md` (FR-REQ-04)

Once all five categories are filled, write the file with **exactly these sections in this order**:

1. **Overview** - one paragraph: what problem this solves and for whom.
2. **Personas** - one row per target user with profile and primary need.
3. **Jobs To Be Done** - bullet list of the verbs the user hires this product to perform.
4. **Functional Requirements** - `FR-XX` IDed table of must-have behaviors. Render any data schema or structured config inline as a fenced ` ```yaml ` block, not prose - it is cheaper to parse and to tokenise.
5. **Acceptance Scenarios** - Given/When/Then scenarios that make each load-bearing FR testable (see below).
6. **Non-Functional Requirements** - `NFR-XX` IDed table (performance, security, usability at minimum).
7. **Hard Constraints** - what cannot change.
8. **Explicit Non-Goals** - what is deliberately not in v1.
9. **Success Metric** - one sentence answering "how do we know it worked?"
10. **Open Questions** - checklist form (see below).

Use the existing header block at the top of `templates/claude/srs.md` (project name, version, status, last-updated) as the skeleton. The skill's job is to fill it in.

---

## Acceptance Scenarios (BDD)

A flat list of functional requirements is not testable on its own - "the app has login" says nothing about what correct behavior is. For every load-bearing FR, write at least one **acceptance scenario** in Given/When/Then form. This forces the requirement into a **State -> Action -> Outcome** shape, which is what makes failure conditions explicit before any code exists.

Write each scenario as a fenced ` ```gherkin ` block:

```gherkin
Scenario: reject an expired session token
  Given a token issued more than 24 hours ago
  When the user requests GET /profile
  Then the API responds 401 with error code TOKEN_EXPIRED
```

Rules:

- **Cover the edge, not just the happy path.** Every FR gets its success scenario **and** at least one failure/edge scenario (empty input, unauthorized, boundary value, downstream failure). The edge scenarios are the point - they are where unspecified behavior turns into bugs.
- **One observable outcome per Then.** If a scenario needs three unrelated `Then`s, it is three scenarios.
- **Reference the FR id** the scenario proves (e.g. `Scenario: [FR-03] ...`) so downstream skills can trace coverage.

These scenarios become the acceptance criteria `/spec-plan` stages against and the failing tests `/spec-feature` and `/spec-bug` write first.

---

## Open Questions as a checklist (FR-REQ-05)

Every open question surfaced during cross-questioning that the user could not confidently answer MUST be tracked at the bottom of `srs.md` under `## Open Questions`, one line per question, as a GitHub-flavoured checklist:

```markdown
- [ ] Which regions do we launch in?
- [ ] Do we support offline mode in v1?
```

Downstream skills read this section. `/spec-plan` will refuse to run if any load-bearing question here is still unchecked (FR-PLAN-05).

---

## Completion summary (NFR-USE-01)

When `srs.md` is written, print exactly one line summarising what was produced, plus a one-line next-step hint:

> Wrote claude/srs.md ({FR count} functional, {NFR count} non-functional, {open-question count} open). Next: run `/spec-design` to build the design system.

---

## Student persona note (NFR-USE-03)

If the project's `CLAUDE.md` is scaffolded for the **student** persona (the "For the Student" block is present), append a **"Why this step?"** annotation after the completion summary:

> Why this step? A Software Requirements Specification is the frozen contract between what you want and what gets built. Every later decision - architecture, design, plan, code - references it. Skipping it is why most solo projects drift.

The annotation is skipped for other personas.

---

## What NOT to do

- Do not write code.
- Do not propose architecture (that is `/spec-design` and Stage 6's job).
- Do not answer questions on the user's behalf when their answer is unclear - re-ask.
- Do not silently invent categories the user did not confirm.
- Do not skip cross-questioning "because the user seems to know what they want."

If the user tries to skip cross-questioning, explain that the refusal gate is the point of the workflow and ask again.
