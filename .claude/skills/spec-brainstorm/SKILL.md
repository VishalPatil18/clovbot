---
name: spec-brainstorm
description: Structured brainstorming of ideas, solutions, features, and approaches. Use before committing to a design, when the path is unclear, when weighing options, or when the user says "brainstorm", "what are our options", "how could we approach this", "help me think through", or invokes `/spec-brainstorm`. Diverges first to widen options, then converges to a recommendation with explicit tradeoffs - it does not silently pick one.
---

# spec-brainstorm

Generate and shape options before locking a decision. The failure mode of a fast agent is jumping to the first plausible approach; this skill forces a wider search, then a reasoned choice. It produces options and a recommendation - not code.

Use this before `/spec-architect`, `/spec-plan`, or `/spec-feature` when the approach is genuinely open. If the path is already clear, say so and skip - do not manufacture false choices.

---

## Read first

- `claude/srs.md` - the problem, target users, success metric, and hard constraints. Ideas that violate a constraint are dead on arrival; ideas that do not move the metric are noise.
- `claude/context.md` **Current State** - what already exists, so options build on it rather than ignore it.

## The loop: diverge, then converge

### Step 1 - Frame the real problem

Restate the problem in one sentence and name the constraints and the success metric. Half of bad brainstorms solve the wrong problem. Confirm the frame with the user before generating if it is at all ambiguous.

### Step 2 - Diverge (widen the option space)

Generate 3-6 genuinely different approaches - not one idea with cosmetic variants. Push for range: the boring proven one, the minimal one, the ambitious one, the "buy don't build" one, the "do nothing / change the requirement" one. Suspend judgment here; quantity and spread first.

### Step 3 - Converge (score against what matters)

For each surviving option, state honestly:

- **Fit** - how well it moves the success metric and satisfies constraints.
- **Cost** - build effort, new dependencies, operational burden.
- **Risk** - what is uncertain, what could go wrong, what is hard to reverse.
- **Reversibility** - one-way door or two-way door? Two-way doors deserve faster, cheaper decisions.

Kill options that violate a hard constraint outright. Compare the rest on the axes above.

### Step 4 - Recommend, do not dictate

Pick one, say _why_ it wins on the axes that matter, and name the runner-up and the condition under which it would win instead. State the assumptions the recommendation rests on so they can be challenged.

## Discipline

- **No solutioning past the decision.** Stop at the recommendation; implementation is another skill's job.
- **Cite the constraint, not taste.** "Rejected because it needs a paid service (violates the zero-cost constraint)" beats "I don't like it".
- **Surface the do-nothing option.** Often the requirement should change instead of the code.

## Output and memory

- Present the options as a compact comparison (option -> fit / cost / risk / reversibility), then the recommendation and its assumptions.
- When a decision is reached, log it in `claude/design-decisions.md`: _context -> options considered -> decision -> consequences accepted_, so it is not re-litigated later.

## Red flags

- One idea dressed up as three; no genuinely different alternative offered.
- A recommendation with no stated tradeoff or assumption.
- Ideas that ignore a hard constraint from the SRS.
- Jumping to implementation before the choice is made and recorded.
