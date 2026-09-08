# Call Drivers - Scoping by What Members Actually Call About

> Companion to `docs/ideas.md`. Where that file scopes by feature, this one scopes by call driver, which is the unit the success metric is measured in.
>
> **Date:** 2026-09-07. **Sources:** `docs/research-init.md`, `case-study-prompt.pdf`. Nothing here comes from outside those two plus the CMS boundary they cite.

---

## 1. How to read this file

Three buckets:

- **A - answerable today from public plan documents, no auth.** This is v1 scope.
- **B - answerable only with member-specific data behind auth.** This is the roadmap.
- **C - must never be automated, routes to a human.** This is the guardrail spec.

Every row carries a **basis** tag, because the confidence varies enormously across this document and collapsing that would be dishonest:

| Tag | Meaning |
| --- | --- |
| `[brief]` | The classification is stated in `docs/research-init.md`. High confidence. |
| `[prompt]` | The category is named in `case-study-prompt.pdf`. High confidence it matters; the A/B/C split is still mine. |
| `[cms]` | The classification follows from a CMS rule cited in the brief (42 CFR 422.2260-2274, CMS-4201-F, the Feb 2024 FAQ). High confidence in the boundary, mine in the application. |
| `[inferred]` | My construction from general Medicare Advantage structure. Plausible, unverified, and the thing to challenge first. |

---

## 2. What is actually sourced, and what is not

**Sourced.** The brief draws the public/authenticated line explicitly:

> _Safe without auth (v1):_ EOC, Summary of Benefits, formulary/drug tiers, provider/pharmacy directory, OTC/supplemental benefit descriptions, premiums, the general grievance/appeal _process_, ID-card _how-to_.
>
> _Requires auth + PHI (v2):_ claim status/EOB, deductible/accumulator balances, prior-auth status, the member's own medication history, ID-card reissue to an address.

That is bucket A and bucket B, already drawn, by someone who thought about it. The taxonomy below expands it into call-shaped categories but does not move the line.

**Sourced.** The assignment names four drivers: benefits, providers, a claim, a prior authorization.

**Sourced.** The CMS boundary that populates bucket C: AI may assist but must not make coverage denials, determinations must be individualized, AI should not function to delay or discourage care. And the marketing-versus-communications line, where anything intended to influence plan selection leaves the communications regime.

**Not sourced, anywhere in this repo.** A distribution of Medicare Advantage call volume by category. There is no call-mix data in `research-init.md`, in the assignment, or in any public Clover document I have seen. Section 5 estimates it. That estimate is reasoning, not evidence, and it is labelled as such throughout. I have not manufactured a citation for it.

---

## 3. Bucket A - public documents, no auth

v1 scope. Answerable from the corpus in `ideas.md` P1-01.

| # | Call driver | Source document | Basis |
| --- | --- | --- | --- |
| A-01 | Is a service covered at all? ("Do you cover hearing aids?") | Evidence of Coverage, Summary of Benefits | `[brief]` `[prompt]` |
| A-02 | What is the copay or coinsurance for a service, as designed | Summary of Benefits | `[brief]` `[prompt]` |
| A-03 | What is the deductible or out-of-pocket maximum, as designed | Summary of Benefits | `[brief]` |
| A-04 | Is my drug on the formulary, and what tier is it | Formulary | `[brief]` |
| A-05 | What do the drug tiers cost, how does the coverage gap work | Formulary, EOC | `[brief]` |
| A-06 | Which pharmacies are in network | Pharmacy directory | `[brief]` |
| A-07 | Is a named provider in network, how do I find a specialist | Provider directory | `[brief]` `[prompt]` |
| A-08 | What supplemental benefits do I have - dental, vision, hearing, OTC allowance, transportation, fitness | Summary of Benefits, EOC | `[brief]` |
| A-09 | What is the premium, and how do I pay it | Summary of Benefits | `[brief]` |
| A-10 | What is on my ID card and how do I use it | Plan materials | `[brief]` |
| A-11 | How does the appeal and grievance **process** work, and what are the deadlines | EOC | `[brief]` |
| A-12 | Which services require prior authorization, and how does the **process** work | EOC, Summary of Benefits | `[inferred]`, sits beside A-11 in the brief's logic |
| A-13 | Does this plan require referrals to see a specialist | EOC | `[inferred]` |
| A-14 | What happens when I travel, or use an out-of-network provider | EOC | `[inferred]` |
| A-15 | Where do I find my plan documents | Plan materials | `[brief]` |
| A-16 | What are the plan's service area and rules for moving | EOC | `[inferred]` |

**The distinction doing the work in A-02, A-03 and A-09:** the plan's *design* is public, the member's *position against it* is not. "What is my specialist copay" is A. "How much of my deductible have I used" is B. The bot must be able to tell those apart, which is `ideas.md` P2-17.

---

## 4. Bucket B - requires auth and member data

Roadmap. Partially built in `ideas.md` P2-15 through P2-20 against synthetic records.

| # | Call driver | Why it needs auth | Basis |
| --- | --- | --- | --- |
| B-01 | What is the status of my claim, and what does this EOB mean | Member's own claim record | `[brief]` `[prompt]` |
| B-02 | How much of my deductible or out-of-pocket maximum have I used | Accumulator balance | `[brief]` |
| B-03 | What is the status of my prior authorization request | Member's own request record | `[brief]` `[prompt]` |
| B-04 | What medications am I on, when is a refill due | Member medication history | `[brief]` |
| B-05 | Send me a replacement ID card | Address on file | `[brief]` |
| B-06 | Who is my assigned PCP, and how do I change it | Member enrollment record | `[inferred]` |
| B-07 | Has my premium payment gone through, am I late | Billing record | `[inferred]` |
| B-08 | Update my address, phone, or contact preferences | Write access to the member record | `[inferred]` |
| B-09 | What appointments do I have | Member scheduling data | `[inferred]`, named in the `ideas.md` P2-15 seed |
| B-10 | How much of my OTC or supplemental allowance is left | Accumulator balance | `[inferred]` |
| B-11 | Am I actually enrolled, and in which plan | Member enrollment record | `[inferred]` |

**B-08 is a different animal from the rest.** Everything else in this bucket is a read. B-08 is a write to a member record, which raises identity-proofing to a level a 6-digit email OTP does not meet in production. Keep it read-only in v1 and say so.

---

## 5. Bucket A's share of call volume

**The honest headline: I do not know, and neither does anything in this repo.**

What follows is a reasoned prior with a wide band, offered because the scoping decision needs a number and refusing to give one is not more honest than giving one with its uncertainty attached.

### The estimate

| Bucket | Estimated share of call volume | Confidence |
| --- | --- | --- |
| A - public documents | **40-55%** by stated topic | **Low** |
| B - member-specific | 30-45% | **Low** |
| C - must route to human | 10-20% | **Low** |

### How that was reached

1. The assignment names four drivers and two of them (benefits, providers) are bucket A while two (a claim, a prior authorization) are bucket B. A naive read gives 50/50. The order in the sentence is not evidence of ranking.
2. "Benefits" and "providers" are broad umbrella categories. "A claim" and "a prior authorization" are narrower, though they carry longer and more emotional calls, which is why they are salient enough to be named.
3. The brief's own public/auth split lists eight public categories against five authenticated ones. That is a signal about topic breadth, not about volume, and should not be read as 8:5.
4. Bucket C is sized from the observation in the brief that compliance and identity verification push contacts to humans, plus the CMS categories in section 6. It is the tightest of the three bands and still a guess.

### The caveat that matters more than the number

**A meaningful share of bucket A arrives disguised as bucket A but is really bucket B.** Members do not ask abstract questions. "Is an MRI covered?" is usually "was *my* MRI covered, and why did I get this bill?" The topic is A; the actual job is B.

If that conversion is common, the share of calls a public-documents-only bot can *fully resolve* is materially lower than A's topic share. My estimate:

| Measure | Estimate | Confidence |
| --- | --- | --- |
| Bucket A by stated topic | 40-55% | Low |
| Bucket A **fully resolvable without member data** | **30-45%** | **Lower** |

This is the single biggest threat to the v1 thesis and it should be said out loud in the interview rather than discovered in the follow-up questions.

### Share is not deflection

The most common error in this space, and the brief flags it directly: vendors quote per-workflow containment as though it were end-to-end deflection. The brief's own worked example is 70% containment on scheduling amounting to 21-28% end-to-end when scheduling is 30-40% of the mix.

The chain is three factors, not one:

```
deflection  =  S  ×  E  ×  R

S = share of call volume that is bucket A and fully resolvable
E = engagement: share of would-be callers who try the bot at all
R = resolution: share of attempts answered correctly AND accepted by the member
```

| Factor | Range | Where the range comes from |
| --- | --- | --- |
| S | 0.30 - 0.45 | Section 5 above. Low confidence. |
| E | 0.25 - 0.50 | Constrained by sourced numbers: roughly 30% of adults 65+ never use the internet, and 46% of adults 50+ report little or no trust in AI. Both are hard ceilings on who will try this instead of dialling. |
| R | 0.60 - 0.80 | Assumes the citation and refusal discipline in `ideas.md` P1-03 holds. Unverified until the P1-11 eval harness runs. |

**Product: roughly 5% to 18% end-to-end deflection. Midpoint around 10%.**

That lands *below* the brief's 25-45% blended ceiling for healthcare and insurance self-service, which is correct behaviour: that figure is a ceiling for a mature multi-channel deployment, not a forecast for a single web widget over a partial corpus.

**E is the biggest lever and the most neglected.** Doubling engagement from 25% to 50% doubles deflection outright. No amount of retrieval improvement does that. This is the quantified case for the senior-first UX work in `ideas.md` P1-06 and P1-07 - it is not accessibility as decoration, it is the highest-elasticity term in the equation.

---

## 6. Bucket C - the guardrail spec

Never automated. Every one of these produces a refusal plus a human path, per `ideas.md` P1-08 and P1-10. Written as behaviour, not as a list, because this section is meant to be implementable.

| # | Trigger | Required behaviour | Basis |
| --- | --- | --- | --- |
| C-01 | Requesting a coverage determination, or asking whether a denial was correct | Explain what a coverage determination is and how to request one. State plainly that it cannot make or evaluate the decision. Route to a human. Never speculate on the outcome. | `[cms]` CMS-4201-F: AI may assist but must not make coverage denials; determinations must be individualized. |
| C-02 | Any clinical or medical question - symptoms, medication advice, whether to seek care | Refuse, state it is not a clinician, route to a human or the nurse line. Never hedge into partial advice. | `[cms]` `[brief]` |
| C-03 | Anything that could delay or discourage seeking care | Do not gate, do not caveat toward inaction. When in doubt, route to a human immediately. | `[cms]` The Feb 2024 FAQ language that AI "should not function to delay or discourage care" makes this an active obligation, not just a prohibition. |
| C-04 | Plan selection, enrollment, disenrollment, or comparison against another plan | Refuse and route. Answering steers plan selection, which leaves the communications regime and becomes marketing under 42 CFR 422.2260-2274, subject to the strict review regime. | `[cms]` |
| C-05 | Filing a grievance or appeal, as opposed to asking how the process works | Explaining the process is A-11. Actually filing routes to a human every time. | `[cms]` `[inferred]` |
| C-06 | Emergency, urgent symptoms, or a member in distress | Break out of the flow immediately. Emergency guidance and a human path. No retrieval, no citation, no refusal script. | `[inferred]` |
| C-07 | Fraud, waste, or abuse reports | Route to a human. Do not collect details. | `[inferred]` |
| C-08 | Complaints about quality of care or about a provider | Route to a human. These feed CMS complaint channels and cannot sit in a chat log. | `[inferred]` |
| C-09 | Any request to update a member record, or a request from someone who is not the member | Route to a human. Email OTP does not meet production identity proofing for a write. | `[inferred]`, see B-08 |
| C-10 | Bot confidence below the citation threshold, for any question at all | Refuse with the reason, show what it did find, offer the pre-filled callback. This is the catch-all that makes the other nine safe to under-specify. | `[brief]` |

**Design note.** C-01 and C-05 are one word apart from A-11 and A-12. "How do appeals work" is bucket A; "appeal this for me" and "was my denial right" are bucket C. The classifier separating them is the same one doing A-versus-B in `ideas.md` P2-17, and it carries the most legal weight of anything in the build. Both directions belong in the eval harness.

---

## 7. What this changes

| Where | Change |
| --- | --- |
| `ideas.md` P1-01 corpus | Index in A-01 to A-16 order rather than scrape-convenience order. |
| `ideas.md` P1-07 suggested questions | Seed directly from A-01, A-02, A-04, A-07, A-08. Highest-volume bucket A drivers get the empty state. |
| `ideas.md` P1-09 scope disclosure | Publish the A list as "what I can answer" and the B list as "what needs sign-in". C stays invisible to the member and lives in the refusal behaviour. |
| `ideas.md` P1-10 safety refusals | Replaced by section 6 of this file. Ten triggers with specified behaviour, not a general instruction to refuse clinical questions. |
| `ideas.md` P1-11 eval harness | Restructured by bucket: A questions test citation accuracy, B questions test that the login gate fires, C questions test refusal. The A-11/C-01 and A-12/C-01 near-miss pairs are the hardest and most valuable cases in the set. |
| `ideas.md` P1-12 instrumentation | Tag every logged question with its bucket. After a week of traffic this file's section 5 stops being a guess and becomes measured. That is the whole point of logging. |
| `ideas.md` P2-17 login detection | Now has a defined boundary to detect: bucket A versus bucket B, with the C carve-outs from section 6. |

---

## 8. How to replace the guesses with facts

Section 5 is the weakest thing in this repo. Four ways to fix it, cheapest first:

1. **Ask.** The assignment says explicitly to email Collin with questions about the prompt, the problem space, or Clover. "What are your top ten call drivers by volume?" is the highest-value question available, and asking it is itself part of what the assignment says is being assessed.
2. **Map the IVR menu tree.** A plan's member services phone menu is the company's own answer to "what do people call about," already ordered by expected volume, and it is public. Free, legitimate, takes ten minutes.
3. **Mine the help centre.** The ordering and prominence of FAQ topics on a plan's member site is a second proxy for the same ranking.
4. **Instrument and wait.** `ideas.md` P1-12 with bucket tagging turns this into measurement after real traffic. Not available before the interview, but it is the correct long-run answer and worth saying so.

Until one of those lands, every number in section 5 should be spoken with its confidence attached. A wide honest band is a better interview answer than a precise invented one.
