---
name: spec-cicd
description: Review and set up the CI/CD pipeline - quality gates, test runners, and deployment automation. Use when configuring or auditing build/deploy pipelines, adding automated checks, debugging CI failures, or when the user says "set up CI", "review the pipeline", "add a quality gate", "CI is failing", or invokes `/spec-cicd`. Every gate is enforcement for another skill - it catches on every change what humans and agents miss.
---

# spec-cicd

Automate the quality gates so no change reaches production without passing them. CI/CD is the enforcement mechanism for every other skill - it runs the same checks consistently on every single change.

Two principles: **shift left** (catch problems as early as possible - a bug caught in lint costs minutes, in production costs hours) and **faster is safer** (smaller, more frequent releases are easier to debug than large ones).

---

## Read first

- `claude/context.md` **Current State** - the test runner, build command, lint/type-check commands, and deploy target. The pipeline must run the project's real commands, not generic ones.
- The existing CI config (`.github/workflows/` or equivalent) and `package.json` scripts.

## The quality-gate pipeline

Every change passes these gates before merge, in order (shift-left):

`lint -> type-check -> unit tests -> build -> integration tests -> e2e (optional) -> security audit -> bundle-size`

**No gate is skippable.** If lint fails, fix lint - do not disable the rule. If a test fails, fix the code - do not skip the test.

## Setup / review checklist

- [ ] Pipeline runs on every PR and every push to the default branch.
- [ ] All gates present: lint, type-check, tests (with coverage), build, native security audit.
- [ ] Failures **block merge** - branch protection requires passing checks and at least one review.
- [ ] Dependencies cached; independent gates run in parallel jobs; the suite finishes under ~10 minutes.
- [ ] Secrets come from the CI secrets manager, never from code or workflow files. CI never holds production secrets - use separate test secrets.
- [ ] Deployment has a rollback mechanism (see `/spec-launch`).
- [ ] Integration tests get a real service (e.g. a Postgres service container), migrations applied from CI.

## Feeding CI failures back into the loop

The point of CI with an agent is the feedback loop. On failure: copy the exact failing output, paste it back, fix locally, verify, push again. Common shapes: lint failure -> run the fixer and commit; type error -> read the location and fix; test failure -> hand to `/spec-bug`; build error -> check config/deps.

## Optimizing a slow pipeline (in order of impact)

Cache dependencies -> parallelize jobs -> run only what changed (path filters) -> shard tests across runners -> move slow tests off the critical path (scheduled) -> larger runners. Optimize the pipeline; never skip it to save time.

## Output and memory

- Present the pipeline as config for the project's actual CI system, wired to its real commands.
- Report review findings as: _gate -> gap -> what could reach production because of it_, ranked by risk.
- Record the pipeline shape and any deploy/rollback decisions in `claude/context.md` **Current State**.

## Red flags

- No CI at all, or CI that only checks tests pass (ignoring lint/types/audit/build).
- Failures ignored or silenced; tests disabled to make the pipeline green.
- Production deploys with no staging verification and no rollback.
- Secrets in workflow files; production secrets available to CI.
- A pipeline over 10 minutes with no caching or parallelism.
