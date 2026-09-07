# Project Context - Compressed Snapshot

> Single source of truth for "what exists right now." Read this before answering questions about project state. Do not re-derive from source.
>
> Current State, Key Decisions and Open Questions are edited in place. Session History is append-only: never rewrite a past entry, correct it in a new one.

| Field                | Value                          |
| -------------------- | ------------------------------ |
| Snapshot date        | 2026-09-07                     |
| Current stage        | Pre-requirements. No SRS yet.  |
| Last feature shipped | None. No production code exists.|

---

## 1. What exists

- **Research briefing** - `docs/research-init.md`, 56 lines (dense, ~15K). Clover snapshot, Medicare Advantage rules that constrain the build, call-center economics for the ROI case, competitive landscape, 65+ UX findings, architecture notes. This is the only sourced-fact corpus in the repo right now.
- **Design system** - `design/DESIGN.md`, 405 lines, written and non-placeholder.
- **Working contract** - `CLAUDE.md`, rewritten this session. See section 3.
- **Spec scaffold** - `claude/srs.md`, `features.md`, `plan.md`, `design-decisions.md`, `learnings.md` all still carry template placeholders. Nothing in them is real yet.

## 2. What works (verified)

Nothing. No code, no tests, no runnable app.

## 3. Locked decisions

Set by the user, binding for the whole project. Full statement in `CLAUDE.md` section 1.

- Spec before code. No production code without an entry in `srs.md` or `features.md`.
- TDD, no exceptions. Failing test first.
- **Zero PHI in v1.** No member auth, no claims, no prior-auth status. Anything needing member identity goes to the v2 roadmap.
- **Cite or refuse.** Every bot answer names its source document, or it declines and offers a human. No third path.
- Design forks go to the user with options and tradeoffs. Claude does not decide. The call is logged as an ADR in `design-decisions.md`.
- No invented Clover, Medicare, or CMS facts. Only `docs/research/` and the scraped corpus.
- Ask before adding any dependency.
- Zero monetary cost. Free tier, open source, or local only.

The research briefing's recommended shape (RAG over public plan documents, escalate everything else) matches these constraints but is **not yet ratified** as the product decision. That happens in `/spec-requirements`.

## 4. What's next

1. `/spec-requirements` - turn the briefing into `claude/srs.md`. Blocks everything else.
2. Decide the stack. Nothing is chosen yet.
3. Create `docs/research/` and move or copy the briefing into it, since the contract points citations at that directory.
4. `/spec-plan` after the SRS settles.

## 5. Active environment

- **Branch:** `development` (main branch is `main`)
- **Language / framework / runtime:** undecided
- **Package manager / test runner / deploy target:** undecided
- **Services running:** none
- **Env vars:** none required yet, no `.env.example` exists
- **Budget:** $0. See the zero-cost rule.

## 6. Constraints

- 48-hour case study interview, solo, roughly 40 working hours. Scope for a narrow defensible demo, not breadth.
- Audience is Clover Health members, mostly 65+. WCAG AA, large targets, plain language are requirements, not polish.

## 7. File map

| Area              | Path                    | State                    |
| ----------------- | ----------------------- | ------------------------ |
| Working contract  | `CLAUDE.md`             | written                  |
| Research corpus   | `docs/research-init.md` | written                  |
| Design system     | `design/DESIGN.md`      | written                  |
| Requirements      | `claude/srs.md`         | scaffold                 |
| Plan              | `claude/plan.md`        | scaffold                 |
| Features log      | `claude/features.md`    | scaffold                 |
| Decisions (ADR)   | `claude/design-decisions.md` | scaffold            |
| Application code  | none                    | does not exist           |
| Test suite        | none                    | does not exist           |

## 8. Open questions

- [ ] Stack, including the retrieval and model layer, under the zero-cost rule.
- [ ] What the v1 corpus actually is: which public Clover documents, scraped how, refreshed how.
- [ ] What "cite the source" renders as for a 65+ reader. A document name, a section, a link?
- [ ] Escalation path when the bot refuses. Phone number, callback form, live handoff?
- [ ] Does `docs/design-decisions.md` (the user's original wording) need to exist, or does `claude/design-decisions.md` stand? Currently the latter.

---

# Session History

> Append-only. Newest at the bottom. One entry per session that changed code, design, or architecture.
>
> Template:
> ```
> ## YYYY-MM-DD - <title>
> **Did:** <what changed>
> **Files:** <path> (create|update|delete) - <why>
> **Decisions:** <decision> - <rationale>
> **Open:** <follow-ups>
> ```

## 2026-09-07 - Working contract locked

**Did:** Established the behavior contract for the whole project before any spec or code. Rewrote `CLAUDE.md` from the 399-line scaffold template into a 94-line contract carrying the user's eight rules. Logged it in the changelog. Populated this file with real state.

**Files:**
- `CLAUDE.md` (update) - replaced template with the contract. Cut unfilled Environment placeholders and a stale block referencing another repo's stack (Electron, Drizzle, `lib/db/repo/**`) that would have misled every session.
- `CHANGELOG.md` (update) - logged the contract under `[Unreleased] > Changed`.
- `claude/context.md` (update) - this file, replaced scaffold with real state.

**Decisions:**
- ADRs live in `claude/design-decisions.md`, not the `docs/design-decisions.md` the user first named. Reason: the file already exists and the `/spec-*` skills read and write it. Two logs would drift. Flagged to the user, reversible.
- The changelog entry stands even though a contract rewrite is invisible to a member, which the contract's own section 8 argues against. Flagged, user's call.

**Open:** Everything in section 8. Next action is `/spec-requirements`.
