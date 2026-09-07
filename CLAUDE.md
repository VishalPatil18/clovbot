# CLAUDE.md

**Product:** Clover Health member-facing chatbot. **Audience:** members, mostly 65+.
**Constraint:** 48-hour case study, solo, ~40 hours. Ship narrow and defensible, not broad.

Read this before every prompt. It is the contract.

---

## 1. Behavior contract (non-negotiable)

1. **Spec before code.** No production code without a spec entry in `claude/srs.md` or `claude/features.md`. Asked to build something unspecced: stop, say which spec is missing, offer to write it.
2. **TDD, no exceptions.** Failing test, then implementation, then refactor. Asked for implementation directly: push back once, then follow the decision.
3. **Zero PHI in v1.** No member auth, no claims, no prior-auth status, nothing member-specific. A feature that needs to know who the member is goes to the v2 roadmap, not the build.
4. **Cite or refuse.** Every bot answer cites its source document, or it declines and offers a human. No third path.
5. **Design forks go to the user.** Two or three real options, tradeoffs stated, my lean and why, then stop and wait. User decides. After the call, append an ADR to `claude/design-decisions.md`.
6. **No invented facts** about Clover, Medicare, or CMS. Only `docs/research/` and the scraped corpus. Missing a fact: say so.
7. **Ask before any new dependency.** Come with a defensible reason and what it replaces.
8. **Short responses.** Optimize for reading time, not completeness.

Rules 1-4 also bind subagents. Pass them down when dispatching.

## 2. Working invariants

- Read `claude/context.md` and the relevant `claude/features.md` section before any code change.
- Ambiguous requirement: ask. Do not guess.
- Diff-scoped refactors only. Touch what the cycle changed.
- After a feature cycle, update in order: `claude/context.md`, `claude/features.md`, `claude/design-decisions.md`, `claude/learnings.md`, `CHANGELOG.md`.
- End any file-changing response with a Conventional Commits message (`feat|fix|refactor|docs|test|chore|perf|ci: <imperative, <=50 chars>`).
- `spec.config.js` wins over defaults here, except rules 1-4.
- Pin every library version and verify it against current docs. Training knowledge is stale.
- No secrets, personal data, or live URLs in specs, prompts, or memory files. Reference an env var.

## 3. Phases

| Phase | Skill | Output |
| --- | --- | --- |
| Requirements | `/spec-requirements` | `claude/srs.md` |
| Design | `/spec-design` | `design/design.md` |
| Planning | `/spec-plan` | `claude/plan.md` |
| Feature | `/spec-feature` | code + memory updates |

Feature cycle sub-phases, in order: Requirements, Architecting, Product Specs, Tech Specs, Planning, Code. Skipping one needs an explicit override logged in `claude/design-decisions.md`.

**Bug (`/spec-bug`):** reproduce (no repro, no fix), failing regression test, smallest fix, full suite, log under `### Fixed`. No refactors.
**Docs (`/spec-docs`):** diff docs against reality, get approval, apply. Never touch source.

Support skills: `/spec-architect` `/spec-db-design` `/spec-review` `/spec-security` `/spec-test` `/spec-ux` `/spec-performance` `/spec-git` `/spec-launch` `/spec-brainstorm` `/spec-research` `/spec-resume`.

## 4. ADR format

Append to `claude/design-decisions.md`:

```md
## ADR-NNN: <title>
- **Date:** YYYY-MM-DD  **Status:** accepted | superseded by ADR-NNN
- **Context:** <the fork, in 1-3 lines>
- **Options:** <A / B / C, one line each>
- **Decision:** <what the user chose>
- **Why:** <the reason given>
- **Consequences:** <what this costs or forecloses>
```

## 5. Code rules

- Minimum code that solves the problem. No speculative abstractions, no config for constants that never change, no error handling for impossible states.
- Surgical edits. Do not improve adjacent code. Match existing style. Clean up only orphans your change created; mention pre-existing dead code, do not delete it.
- Strict TypeScript, never `any`. Unions over loose strings. Zod at every trust boundary: user input, model output, scraped content, file reads.
- Early returns. One job per function. Named constants. Immutable by default.
- Errors the user can act on. Never swallow, never print a stack trace to the UI.
- Comments explain WHY, max 15 words, no spec or phase references (`FR-13.1`, `Phase 2`).
- Root-cause fixes only. No band-aids. Present the plan before fixing.
- Zero cost. Free tier, open source, or local. No paid APIs, tiers, or hosting.

## 6. Frontend

Follow `design/DESIGN.md`. Tailwind utilities, no inline CSS. 65+ audience: large targets, high contrast, plain language, WCAG AA as a requirement.

## 7. Writing style

No em or en dashes. Plain hyphens only. Active voice, concrete nouns, varied sentence length. No "seamlessly", "robust", "leverage", "it's not just X, it's Y". No filler openers, no hollow closing summaries. State limits plainly; never claim verified without running the check.

## 8. Records

- `claude/context.md`: what exists, how it works, what is locked in. Append-only session history. Never edit past entries.
- `CHANGELOG.md`: user-facing only, and only when a feature works end to end. No bug fixes, refactors, or invisible changes. Write into the topmost unreleased section; new version headings only on the user's word.

## 9. Integrations

`/caveman` token-lean mode (`claude/caveman.md`) · agentmemory persistent context (`claude/agentmemory.md`)

## 10. Links

[SRS](./claude/srs.md) · [Plan](./claude/plan.md) · [Context](./claude/context.md) · [Features](./claude/features.md) · [Decisions](./claude/design-decisions.md) · [Learnings](./claude/learnings.md) · [Changelog](./CHANGELOG.md)
