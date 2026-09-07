---
name: spec-research
description: Gather external knowledge and market intelligence - modes for knowledge (docs, papers, articles, prior art) and market (competitors, trends, positioning). Use when the user asks "research X", "what does the literature say", "who are the competitors", "what's the market for this", "find prior art", or invokes `/spec-research`. Separates sourced fact from inference, cites where each claim came from, and feeds findings back into the SRS decisions.
---

# spec-research

Bring the outside world in, honestly. Two **modes** - pass the mode as the argument:

- `/spec-research knowledge` (default) - technical/domain knowledge: documentation, papers, articles, prior art, established patterns.
- `/spec-research market` - competitive/market intelligence: competitors, trends, positioning, pricing signals.

The cardinal rule: **cite or flag.** Every claim is either sourced (with where it came from) or explicitly marked as inference/assumption. Confident unsourced claims are the failure mode of research.

---

## Read first

- `claude/srs.md` - the decision this research must inform (which technology, which market, which requirement). Research with no decision attached is a time sink; anchor it.
- `claude/context.md` - what has already been decided, so you do not re-research settled questions.

## Method (both modes)

### Step 1 - Frame the question and the decision

State exactly what is being decided and what evidence would change the choice. "Research auth libraries" is unbounded; "which auth approach fits our zero-cost, self-hosted constraint" is answerable.

### Step 2 - Gather from multiple sources

Do not rely on one source. Prefer primary sources (official docs, the actual paper, the competitor's own site) over secondary summaries. Note the date - stale information about fast-moving tools is a common trap.

### Step 3 - Separate fact from inference

Tag every finding: **[sourced]** with the origin, or **[inference]** with the reasoning. When sources disagree, say so and give the more credible one with why. Never launder an assumption into a fact.

### Step 4 - Synthesize toward the decision

Do not dump links. Answer the framed question: here is what the evidence says, here is the recommendation, here is what remains uncertain.

## Knowledge mode specifics

- Distinguish established practice from one blog's opinion; weight by adoption and primary-source backing.
- For a technique or pattern, capture the tradeoff and the context it fits - not just that it exists.
- Respect the project constraints: a solution that needs a paid service fails the zero-cost constraint regardless of how good it is.

## Market mode specifics

- For each competitor: what they do, who they target, their apparent strength and gap. Look for the unserved segment, not just the crowded one.
- Trends are directional, not certain - mark them as inference and note the signal behind them.
- Tie findings back to the SRS's target users and success metric.

## Output and memory

- Present findings as: _claim -> [sourced: origin] or [inference: reasoning] -> relevance to the decision_, followed by a synthesis and the open uncertainties.
- Record decisions the research settles in `claude/design-decisions.md`, and add durable reference links to `claude/context.md` or the relevant memory file so they are not re-fetched.

## Red flags

- A claim stated as fact with no source and no inference tag.
- A single source treated as ground truth; stale data on a fast-moving topic.
- A link dump with no synthesis and no tie to the decision.
- Research detached from any actual decision in the SRS.
