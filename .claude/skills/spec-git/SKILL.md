---
name: spec-git
description: Git operations and versioning - commit, branch, merge, rebase, resolve conflicts, tag, and release. Use when committing, organizing work across branches, cutting a release, choosing a version bump, or when the user says "commit this", "make a branch", "merge/rebase", "resolve conflict", "cut a release", "bump the version", or invokes `/spec-git`. Treats commits as save points, branches as sandboxes, history as documentation.
---

# spec-git

Git is the safety net. With code generated at high speed, disciplined version control keeps changes reviewable and reversible. Commits are save points, branches are sandboxes, history is documentation.

Never expose secrets, force-push a shared branch, or rewrite published history without explicit confirmation - these are irreversible and require the user's go-ahead.

---

## Read first

- `git status` and `git diff --staged` for what is actually about to be committed.
- `CHANGELOG.md` and existing tags when cutting a release.
- The project's commit convention (this kit uses Conventional Commits - see `CONTRIBUTING.md`).

## Commit discipline

- **Commit early and often** - each verified increment gets its own commit. `implement slice -> test -> verify -> commit -> next`. Never accumulate one giant uncommitted change.
- **Atomic commits** - one logical thing per commit. Do not mix a refactor with a feature, or formatting with behavior.
- **Descriptive messages** - explain the _why_, not the obvious _what_:

  ```text
  <type>: <short imperative description, <= 50 chars>

  <optional body: why, context, decisions not visible in the diff>
  ```

  Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`. First line stands alone in history - "Add email validation", not "update auth".

- **Size** - target ~100 lines per commit; split anything over ~1000 (see `/spec-review` for splitting strategies).

## Branching

- Trunk-based by default: keep the default branch always deployable; work in short-lived branches that merge within 1-3 days. Long-lived branches accumulate merge risk; prefer feature flags for incomplete work.
- Naming: `feature/<desc>`, `fix/<desc>`, `chore/<desc>`, `refactor/<desc>`. Delete branches after merge.
- **Never commit to the default branch directly** when the change is non-trivial - branch first.

## Merge, rebase, conflicts

- Rebase a _local, unpushed_ branch to keep history linear; never rebase shared/published history without confirmation.
- Resolve conflicts by understanding both sides - re-run tests after resolving. A clean merge that fails tests is not resolved.
- Squash only when the intermediate commits are noise; keep them when they tell the development story.

## Pre-commit hygiene (every commit)

1. `git diff --staged` - review exactly what is staged.
2. Scan for secrets: `git diff --staged | grep -i "password\|secret\|api_key\|token"`.
3. Run tests, lint, and type-check. A commit is a save point only if it builds.

## Release and versioning

- **Semantic versioning** `MAJOR.MINOR.PATCH`: breaking -> major, additive -> minor, fix -> patch. When unsure whether a change is breaking, assume it is - a surprise major is cheaper than a broken consumer.
- **Tag the release** and derive the version from the tag, so artifact, tag, and changelog can never disagree: `git tag -a vX.Y.Z -m "Release X.Y.Z" && git push origin vX.Y.Z`.
- **Changelog for humans** - grouped `Added / Changed / Fixed / Deprecated / Removed / Security`, newest first, phrased by user impact. Write the entry in the same change that makes it, not reconstructed at release time.

## Change summary (after any modification)

Report: files changed and why; what you intentionally did **not** touch (scope discipline); any concern (new dependency, strict schema). The "didn't touch" section proves you did not go on an unsolicited renovation.

## Red flags

- Large uncommitted changes; messages like "fix", "update", "misc".
- Formatting mixed with behavior; refactor mixed with feature.
- Committing `node_modules/`, `.env`, or build artifacts (missing `.gitignore`).
- A breaking change shipped under a minor/patch bump; a release with no tag or a hand-edited version out of sync with the tag.
