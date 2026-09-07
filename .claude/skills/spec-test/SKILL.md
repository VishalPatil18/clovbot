---
name: spec-test
description: Review test cases and coverage, and write the tests a change is missing. Use when assessing whether a change is adequately tested, when coverage looks thin, when tests are flaky, or when the user says "review the tests", "test coverage", "are these tests good", "add tests", or invokes `/spec-test`. Judges tests by whether they would catch a regression - not by coverage percentage.
---

# spec-test

A test's only job is to fail when the behavior breaks. Coverage percentage measures lines executed, not bugs caught - a suite can be 100% covered and catch nothing. Review and write tests for the behavior that matters.

---

## Read first

- The change under test (the diff) and its existing tests.
- `claude/context.md` **Current State** for the test runner and how tests are run.
- The `claude/features.md` entry for the acceptance criteria the tests should encode.

## What a good test is

- **Tests behavior, not implementation.** It asserts on inputs and outputs/effects, not private internals - so a refactor that preserves behavior keeps it green.
- **Has a descriptive name** that states the case: `rejects a negative amount`, not `test3`.
- **Would fail today** if the behavior were wrong. The proof a test is real: break the code on purpose and watch it go red.
- **Is deterministic.** No dependence on wall-clock time, ordering, network, or shared mutable state. Inject the clock, seed randomness, isolate fixtures.

## The coverage that matters

Walk the input space of each new/changed path and confirm a test exists for:

- **Happy path** - the intended use.
- **Edge cases** - empty, null, zero, negative, boundary, duplicate, maximum, malformed.
- **Error paths** - not just that it fails, but that it fails the _right_ way with the right message/type.
- **The seams** - every external call (time, network, disk, DB): what the code does when it is slow, fails, or returns garbage.

Missing edge/error tests are the real finding, not a low percentage.

## Test shape and level

- **Prefer the cheapest test that gives confidence.** A fast unit test on the logic beats an e2e test that exercises the same branch slowly.
- **Reserve integration/e2e** for the wiring unit tests cannot see (real DB constraints, route + auth, the golden user flow).
- One assert-concept per test; a test that asserts ten unrelated things hides which one broke.
- For a bug fix, the regression test comes first and must fail before the fix, pass after (this is the `/spec-bug` contract - reuse it).

## Flakiness is a defect, not a nuisance

A flaky test masks real bugs and trains the team to ignore red. Do not "just re-run" - find the nondeterminism (timing, ordering, shared state, real I/O) and remove it, or the suite loses all authority.

## Output and memory

- Report gaps as: _behavior -> missing case -> the regression it would let through_, ranked by risk.
- When you add tests, run them and show they pass; for a bug, show the fail-before/pass-after.
- If acceptance criteria in `claude/features.md` have no corresponding test, flag it as a coverage gap on the feature, not just the code.

## Red flags

- Tests that assert on implementation details and break on every refactor.
- A bug fix with no regression test; a new branch with no test.
- Coverage cited as proof of quality while edge and error paths go untested.
- A flaky test silenced with a retry instead of a fix.
