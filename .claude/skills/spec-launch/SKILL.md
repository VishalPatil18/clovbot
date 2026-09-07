---
name: spec-launch
description: Prepare and run a production launch across environments (dev, staging, production). Use when deploying a feature, promoting a build between environments, planning a staged rollout, or when the user says "launch", "deploy to production", "pre-launch checklist", "rollout plan", "rollback plan", or invokes `/spec-launch`. Every launch is reversible, observable, and incremental - never a big bang.
---

# spec-launch

Ship with confidence. The goal is not just to deploy - it is to deploy safely, with monitoring in place, a rollback ready, and a clear picture of what success looks like. Every launch is reversible, observable, and incremental.

This skill owns the promotion and rollout across environments; `/spec-cicd` owns the pipeline that produces the artifact.

---

## Read first

- `claude/context.md` **Current State** - deploy target, environments, and how deploys are triggered.
- `claude/srs.md` - the success metric this launch moves, and any hard constraints.
- The changelog and the change set going out.

## Pre-launch checklist (all green before you promote)

- [ ] **Quality** - tests pass, build clean, lint/types pass, reviewed; no stray `console.log`/debug or unresolved launch-blocking TODOs.
- [ ] **Security** - no secrets in code, audit clean of critical/high, input validated, authz in place, headers + rate limits set (run `/spec-security`).
- [ ] **Performance** - core flows within budget, no N+1 on the hot path, assets optimized (run `/spec-performance`).
- [ ] **Accessibility** - keyboard, contrast, screen-reader basics (run `/spec-ux`).
- [ ] **Infra** - env vars set in prod, migrations applied or ready, health-check endpoint responds, logging/error reporting live.
- [ ] **Docs** - README/changelog updated; user-facing docs current.

## Environment promotion

`dev -> staging -> production`. Staging mirrors production config; run the full suite plus a manual smoke of critical flows in staging before promoting. Production configuration lives in code/secrets manager, never set by memory.

## Decouple deploy from release with flags

Deploy code with the feature flag **off**, then enable deliberately:

`deploy (off) -> enable for team/beta -> canary 5% -> 25% -> 50% -> 100% -> remove flag + dead code`

Every flag has an owner and an expiration; clean it up within two weeks of full rollout; test both states in CI.

## Staged rollout thresholds

Advance only when green; hold on yellow; roll back on red.

| Metric            | Advance                | Hold               | Roll back          |
| ----------------- | ---------------------- | ------------------ | ------------------ |
| Error rate        | within 10% of baseline | 10-100% above      | > 2x baseline      |
| P95 latency       | within 20%             | 20-50% above       | > 50% above        |
| New client errors | none                   | < 0.1% of sessions | > 0.1% of sessions |

Roll back immediately on: error rate > 2x, P95 > 50% worse, a data-integrity issue, or a security vulnerability discovered.

## Rollback plan (write it before you deploy)

State the trigger conditions, the steps (flag off in < 1 min, or redeploy previous version; derive the version from the tag), the database considerations (does the migration have a down path?), and the expected time-to-rollback. A deploy without a written rollback is not ready.

## Post-launch (first hour)

Health check 200; error dashboard shows no new types; latency steady; the critical user flow works manually; logs flowing; rollback verified ready. Someone watches for the first hour.

## Output and memory

- Produce the pre-launch checklist result, the rollout plan, and the rollback plan as concrete artifacts.
- After launch, append a Session History entry to `claude/context.md` and a `Security`/`Changed` line to `CHANGELOG.md` as applicable.

## Red flags

- Deploying with no rollback plan or no monitoring.
- Big-bang release with no staging and no canary.
- Feature flags with no owner or expiration; prod config set by hand.
- No one watching the first hour; "it's Friday, ship it".
