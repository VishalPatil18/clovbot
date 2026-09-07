# CLAUDE.md

> **Template version:** 1.0.0
> **Read this file before every prompt.** It is the contract between you (Claude) and this project.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## 1. What this project is

<!-- Replace with one paragraph: what the product is, who it's for, what it does. -->

**Product:** chatbot that Clover Health members can talk to
**Audience:** Clover Health members _(primarily seniors aged 65+)_

For frozen requirements, read [`claude/srs.md`](./claude/srs.md).
For the current build plan, read [`claude/plan.md`](./claude/plan.md).
For the compressed current state, read [`claude/context.md`](./claude/context.md).

---

## 2. How you work in this project

This project follows the **Spec-Driven Development** SDLC. You MUST honor these invariants:

1. **Read before you write.** Open `claude/context.md` and the relevant section of `claude/features.md` before any code change.
2. **Cross-question before you decide.** When a requirement is ambiguous, ask. Do not guess.
3. **Spec before code.** Never write production code until the relevant feature's Tech Specs phase is complete.
4. **Diff-scoped refactor.** When `/spec-refactor` runs, touch only files changed in the current cycle.
5. **Memory is sacred.** After every feature cycle, update `claude/context.md`, `claude/features.md`, `claude/design-decisions.md`, `claude/learnings.md`, and `CHANGELOG.md` - in that order.
6. **Suggest a commit.** End any response that changed files with a suggested Conventional Commits message (`<type>: <description>`, imperative subject <= 50 chars; `type` one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`). See `CONTRIBUTING.md`.
7. **Honor project config.** At the start of a session, read `spec.config.js` if it exists and respect its `skills`, `workflow`, and `settings` (its `customInstructions` bind exactly like section 7's). It is the user's customization layer; when it conflicts with a default here it wins, except the mandatory invariants above (spec before code, memory is sacred) always hold.
8. **Write specs token-lean.** Keep narrative prose in Markdown, but render structured data - config, and schemas nested deeper than three levels - as flat fenced ` ```yaml ` blocks. YAML parses more reliably and costs fewer tokens than deep JSON/prose, so specs stay cheap to read and act on.
9. **Pin and verify versions.** Every library named in a spec or plan MUST carry an explicit version. Verify versions against current documentation before use - do not trust model training knowledge, which is stale by definition and will suggest outdated releases.
10. **Keep specs and prompts clean.** Never hardcode secrets, personal data, or live URLs into specs, prompts, or the memory files. Reference an env var or config key instead; an agent will otherwise reuse whatever literal strings it finds in context.

---

## 3. SDLC phases (mandatory)

| Phase         | Skill                | Output                                 |
| ------------- | -------------------- | -------------------------------------- |
| Requirements  | `/spec-requirements` | `claude/srs.md`                        |
| Design        | `/spec-design`       | `design/design.md` + `design/preview/` |
| Planning      | `/spec-plan`         | `claude/plan.md`                       |
| Feature Cycle | `/spec-feature`      | implementation + memory updates        |

The Feature Cycle itself runs six sub-phases in order: Requirements → Architecting → Product Specs → Tech Specs → Planning → Writing Code. Do not skip phases without an explicit user override logged in `claude/design-decisions.md`.

**Supporting skills** (invoke as needed; each reads the memory layer first and writes findings/decisions back):

| Group      | Skills                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Design     | `/spec-architect`, `/spec-db-design`                                                                  |
| Review     | `/spec-review`, `/spec-code-quality`, `/spec-security`, `/spec-performance`, `/spec-test`, `/spec-ux` |
| Delivery   | `/spec-cicd`, `/spec-launch`, `/spec-git`                                                             |
| Ideation   | `/spec-brainstorm`, `/spec-suggest`, `/spec-research`                                                 |
| Continuity | `/spec-resume` (restores from `claude/resume.md`)                                                     |

---

## 4. Bug resolution phases (mandatory)

When invoked via `/spec-bug`:

1. **Reproduce** - if you cannot reproduce, stop and ask for repro steps.
2. **Write a regression test** that fails today.
3. **Apply the smallest possible fix.**
4. **Run the full test suite.**
5. **Log the fix** in `CHANGELOG.md` under `### Fixed`.

No refactors. No abstractions. No scope creep.

---

## 5. Documentation rewrite phases (mandatory)

When invoked via `/spec-docs`:

1. Read the repo state and the memory layer.
2. Produce a diff (docs vs reality) and present it for approval.
3. Apply only on approval. **Never modify source code in this workflow.**
4. Flag any documented feature that no longer exists.

---

## 6. Environment

<!-- Fill these in as the project matures. -->

- **Language(s):** _<e.g., TypeScript 5.x, Python 3.12>_
- **Framework(s):** _<e.g., Next.js 16, FastAPI>_
- **Package manager:** _<npm / pnpm / uv / pip>_
- **Test runner:** _<vitest / pytest / etc.>_
- **Deployment target:** _<Vercel / Fly / etc.>_
- **Required env vars:** see `.env.example`

---

## 7. Custom user instructions

<!-- Anything user-specific that overrides defaults. Keep this short. -->

- _<e.g., "Never use class components in React.">_
- _<e.g., "Prefer Drizzle over Prisma.">_

---

## 8. Integrations active in this project

<!-- Integration blocks below are inserted or removed by `spec-init init --integrations …` and `spec-init customize --add/--remove <name>`. If no block appears here, no integrations are active. -->

- [x] **Caveman** - _token-lean session mode; see `claude/caveman.md`_. Speak in caveman mode to cut output tokens (~65%) while keeping code and commands byte-exact. Activate with `/caveman`; check savings with `/caveman-stats`.

- [x] **agentmemory** - _persistent memory + context; see `claude/agentmemory.md`_. Captures decisions and patterns across sessions and injects relevant context at session start. Prefer recalling from memory before re-reading the repo.

---

## 9. Quick links

- [SRS](./claude/srs.md) · [Plan](./claude/plan.md) · [Context](./claude/context.md)
- [Features log](./claude/features.md) · [Design decisions](./claude/design-decisions.md) · [Learnings](./claude/learnings.md)
- [Design system](./design/design.md) · [Changelog](./CHANGELOG.md)

---

## 10. Persona Guidance

<!-- Blocks below are gated by HTML-comment markers of the form `<!-- persona:NAME -->` ... `<!-- /persona:NAME -->`. The scaffolding CLI keeps only the block(s) whose NAME matches the chosen `--persona` and strips the rest verbatim. Multi-persona blocks list names as CSV (e.g. `persona:student,engineer`). -->

<!-- persona:vibe -->

### For the Vibe-Coder

You are here to ship a working idea, not to debate architecture.

- If a step feels heavy, ask Claude to explain it in one sentence before doing it.
- Skip prose you do not understand - but do not skip a required cross-question.
- Trust the workflow: it protects you from having to redo work later.

<!-- /persona:vibe -->

<!-- persona:student -->

### For the Student

After every phase, ask Claude: **"Why this step?"** and append the answer to [`claude/learnings.md`](./claude/learnings.md).

- Follow the Teach-and-Explain contract on every prompt.
- Use `/spec-docs` to re-read what you built when it stops making sense.
- Do not delete past learnings; the log is append-only.

<!-- /persona:student -->

<!-- persona:engineer -->

### For the Solo Engineer

- Prefer diff-scoped `/spec-refactor` over full-repo cleanups.
- Read `claude/context.md` before Grep - it is cheaper.
- Log every non-trivial architecture decision to `claude/design-decisions.md`, even in solo work.

<!-- /persona:engineer -->

<!-- persona:team -->

### For the Team Lead

- Every PR must run through the checklist in [`.github/pull_request_template.md`](./.github/pull_request_template.md).
- Memory files are shared context - treat unresolved conflicts in them as blocking.
- Rotate `/spec-sync` ownership so the log does not drift under one person.

<!-- /persona:team -->

---

## 11. Think Before Coding

> Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- Do not introduce any assumptions that cannot realistically be implemented. Keep all plans and technical choices strictly realistic.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

---

## 12. Simplicity First

> Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: _"Would a senior engineer say this is overcomplicated?"_ If yes, simplify.

---

## 13. Surgical Changes

> Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that **your** changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.

### Comments

> Explain the non-obvious, nothing else.

- No references to requirements, specs, phases, or dev docs in code - no `FR-13.1`, `(§14.7)`, `Phase 2`, or any file under ``. Code describes itself; the work log lives in `context.md`.
- Keep each comment short and crisp - **max 15 words**.
- Comment the WHY, edge cases, and gotchas - never restate WHAT the code already says.
- Delete comments that add nothing.

---

## 14. Goal-Driven Execution

> Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- `"Add validation"` → "Write tests for invalid inputs, then make them pass"
- `"Fix the bug"` → "Write a test that reproduces it, then make it pass"
- `"Refactor X"` → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 15. Permanent Bug Fixes & Pre-Approval

> No temporary patches. Build robust, approved solutions.

- Do not write quick, temporary "band-aid" patches to bypass a bug.
- Investigate the issue to target the root cause and provide a robust, permanent fix.

**Approval Workflow:** For any bug, draft a clear explanation of what is broken, why it broke, and how you plan to fix it. Present this plan to the user and get explicit approval before making changes to the codebase.

---

## 16. Strict Zero-Cost Policy

> Ensure zero financial overhead.

Do not introduce, use, or recommend any technologies, services, libraries, or deployment strategies that incur monetary costs.

This includes avoiding paid APIs, paid database tiers, premium cloud storage, or hosting platforms with fees. Everything must be 100% free-tier, open-source, or run locally.

---

## 17. Frontend & Design System Guidelines

> Consistently match the design tokens and system aesthetics.

- Strictly follow the design system guidelines and specifications defined in `DESIGN.md` and the mock-screen in `design-samples` and its support.js for design and js.
- Avoid using inline CSS styling.
- Maximize the use of Tailwind CSS utility classes for layouts, responsiveness, and frontend UI components.

---

## 18. Project Records (`context.md` and `CHANGELOG.md`)

> [`context.md`](./context.md) is the project's persistent knowledge base - the record of what has been built so far, how it is implemented, and which decisions shaped it. Treat it as required reading and as the destination for every meaningful change.

**Before coding** in response to any prompt:

- Read [`context.md`](./context.md).
- At minimum, read the **Current State** section (tech stack, architecture, repo layout, build/run/test commands) and the **most recent 2-3 entries in Session History**.
- Use this as the source of truth for what already exists, how it works, and which decisions are locked in. Do not duplicate or contradict prior work without explicit reason.

**After making code, design, or architecture changes** in response to a prompt:

- Append a new entry to **Session History** using the template defined at the top of `context.md`. Record: what was done, files touched (path + create/update/delete + why), decisions made and their rationale, and any open questions or follow-ups.
- Update **Current State** when the stack, architecture, repo layout, or build/run/test commands materially change.
- Update **Key Decisions** when a non-trivial architectural or product decision is made.
- Update **Open Questions / TODOs** as items are added or resolved.
- **Never edit past Session History entries** - the log is append-only. If a prior entry turns out to be wrong, correct it in the new entry rather than rewriting history.

Skip the append only when no code, design, or architecture changed (e.g. a pure clarifying-question turn). When in doubt, append.

### Changelog (`CHANGELOG.md`)

> The changelog is user-facing: `/changelog` renders this exact file inside the app. Every line of it is product copy, so section 9's writing rules apply.

**When a piece of functionality works end to end, add it to the changelog in the same turn you finish it.** End to end means the owner could open the app and use it, not that the code exists.

- Write into the **topmost version section**, which is the current unreleased one. Only create a new version heading if the newest one is already released, and mark it `_unreleased_` rather than inventing a ship date.
- **Never open a new version because a feature feels big.** Versions are cut when the owner says to release one. Until then everything accumulates under the current heading.
- Group entries under a short `###` heading naming the capability from the user's side, not the module that changed.
- State plainly what the feature deliberately refuses to do, and anything still unverified or limited. A reader months from now reads unexplained gaps as oversights.
- When the owner says to release, replace `_unreleased_` with the date and give the version its short name.

**What never goes in the changelog:**

- Bug fixes, including ones found and fixed while building the feature itself.
- Refactors, renames, dependency bumps, test-only changes, and anything invisible from outside the app.
- Minor tweaks: copy edits, spacing, a changed default, a widened column.

If the owner could not notice and use the change, it belongs in `context.md` alone. `context.md` records everything; the changelog records what shipped.

---

## 19. Writing Style

> Write the way a person writes. No em dashes.

Applies to everything you produce: chat replies, code comments, commit messages, `context.md` entries, docs, specs, and UI copy.

**Punctuation**

- **Never use em dashes (`—`) or en dashes (`–`).** Use a comma, a colon, a full stop, or brackets instead. Rewrite the sentence if none of those fit.
- Use a plain hyphen (`-`) only where a hyphen belongs: compound words, ranges written as `2-3`, and list bullets.
- Do not stack dashes as a substitute for structure. If a sentence needs three clauses, use two sentences.

**Voice**

- Invoke the **`/humanizer`** skill when writing or reviewing any prose of length: specs, READMEs, changelogs, long explanations. It catches the tells listed below.
- Avoid the usual signs of machine writing: inflated significance ("seamlessly", "robust", "leverage", "delve", "it's not just X, it's Y"), the rule of three in every list, vague attributions ("studies show", "experts say"), superficial `-ing` clauses tacked onto sentence ends, and hollow closing summaries.
- Prefer active voice and concrete nouns. Say what happened and who did it.
- Vary sentence length. Uniform medium-length sentences read as generated.
- Cut filler openers: "It's worth noting", "In today's landscape", "Let's dive in".
- Do not pad. If a paragraph adds nothing the reader cannot infer, delete it.

**Honesty in prose**

- State limits plainly. "This is untested on Windows" beats "should work everywhere".
- Do not claim something is verified unless you ran the check.

---

## 10. Coding Standards

> Consult the **`/coding-standards`** skill before writing or reviewing code. These are the rules that matter most here.

**Naming**

- Descriptive names over short ones: `nextTouchAt`, not `d`. Verb-noun for functions: `loadQueueCandidates`, `recomputePerson`.
- Booleans read as predicates: `isTargetCompany`, `hasParsedProfile`.

**Types**

- Strict TypeScript. Never `any`. Model states as unions (`"out" | "in"`), not loose strings.
- Validate anything crossing a trust boundary with Zod: form data, file uploads, model output, IPC payloads.

**Structure**

- Early returns over nested conditionals. More than three levels of nesting means the function needs splitting.
- Functions do one thing. If you cannot name it without "and", split it.
- Named constants over magic numbers, and keep them next to what they govern.
- Immutability by default: spread rather than mutate, unless the mutation is deliberate and commented.

**Errors**

- Handle what can realistically fail: file reads, model calls, network, SQL. Skip guards for impossible states.
- Fail with a message the user can act on. Never swallow an error silently, and never print a raw stack trace into the UI.

**This project specifically**

- SQL lives only in `lib/db/repo/**` and `lib/db/queries/**`. Domain logic in `lib/domain/**` stays pure, with no I/O.
- Server Actions follow the existing shape: check input, parse with Zod, write, then revalidate.
- Client components do not import Zod schemas. Declare option lists locally instead, so the browser bundle stays small.
- Match the file's existing style even when you would write it differently.

**Verification before you claim done**

- `npx tsc --noEmit`, `npm run electron:compile`, and `npm run check:db` are the real gates. Run them.
- `npm run lint` is not configured in this repo. Do not report it as passing.
- Comment rules live in section 3. Follow them.

---

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, and the user understands the codebase and RAG/GenAI concepts hands-on without unexpected costs.
