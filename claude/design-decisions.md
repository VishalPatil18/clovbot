# Design Decisions Log

> Append-only. Each decision is permanent context. If a decision is reversed, add a new entry that supersedes the old one - never delete history.
>
> D-001 through D-012 are the user's decisions, stated by the user. D-013 onward were reached during requirements cross-questioning. Rationale text for D-001 through D-012 is the user's own reasoning, not a reconstruction.
>
> Comments on thin rationale and on conflicts with the frozen SRS are collected at the bottom of this file, not inside the entries.

---

## Decision D-001 - Public documents only, no auth, no PHI in v1

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | v1 scope |
| Status | accepted |
| Supersedes | - |

### Context

Members call about benefits, providers, claims and prior authorizations. The last two require knowing who the member is, which pulls the whole system into HIPAA scope.

### Options considered

1. Public documents only, no identity - out of HIPAA scope, covers half the named call drivers.
2. Authenticated from the start - covers all four drivers, requires identity verification and a BAA.

### Decision

v1 answers only from Clover's public plan documents plus public corporate and investor-relations content. No authentication, no PHI.

### Rationale

Keeps the whole system outside HIPAA scope for the prototype, which means shipping in 40 hours instead of building identity verification.

### Consequences

- Out of HIPAA scope entirely; no BAA, no identity verification, no audit obligation in v1.
- Loses the highest-intent call drivers, claims and prior authorization.
- Reversible once there is a BAA and an auth story.

---

## Decision D-002 - The assistant informs; it never adjudicates

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Regulatory boundary |
| Status | accepted |
| Supersedes | - |

### Context

A member-facing assistant answering benefits questions sits next to coverage determination, which is a regulated act.

### Options considered

1. Inform only, refuse anything determination-shaped.
2. Answer coverage questions definitively where the documents are clear.

### Decision

The assistant explains rules and processes. It never makes or implies a coverage determination and never gives clinical advice.

### Rationale

CMS has been explicit that AI can assist but not make coverage determinations, and there is active litigation in this space.

### Consequences

- Some questions get "here's the rule, here's how to start the process" instead of a yes or no, which is frustrating for the member.
- Non-negotiable. Not revisitable at any priority.

---

## Decision D-003 - Cite or refuse, enforced by a test

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Answer contract |
| Status | accepted |
| Supersedes | - |

### Context

A generative assistant over benefits documents will produce plausible wrong amounts unless something structurally prevents it.

### Options considered

1. Cite or refuse, with an automated test enforcing it.
2. Cite where possible, hedge otherwise.

### Decision

No uncited answers. Every factual claim carries a citation or the assistant declines and offers a human. Enforced by a build gate, not by prompt instruction.

### Rationale

A wrong benefits answer to a senior is worse than no answer, and it generates the call the product is trying to prevent.

### Consequences

- Higher refusal rate and more escalations than a hedging assistant would produce.
- Makes the refusal path a first-class surface rather than an error state.

---

## Decision D-004 - Hybrid retrieval, not pure vector search

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Retrieval |
| Status | accepted |
| Supersedes | - |

### Context

Plan documents are dense with exact tokens that embeddings handle poorly.

### Options considered

1. Dense vector search alone - simplest, one index.
2. Hybrid dense plus lexical, fused by reciprocal rank fusion.

### Decision

pgvector HNSW plus Postgres full-text search, fused with reciprocal rank fusion in a database function.

### Rationale

Plan documents are full of exact tokens - drug names, CPT codes, dollar amounts, plan IDs - where lexical matching beats embeddings.

### Consequences

- Better recall on the exact-token questions that dominate this corpus.
- More moving parts, and a custom RPC to maintain.

---

## Decision D-005 - HNSW over IVFFlat

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Retrieval |
| Status | accepted |
| Supersedes | - |

### Context

pgvector offers two index types with different operational profiles.

### Options considered

1. HNSW - better recall/latency, no training pass, handles inserts.
2. IVFFlat - faster build, less memory, needs periodic rebuilds, suits static data.

### Decision

HNSW.

### Rationale

Better recall-latency tradeoff, no training pass, and it tolerates incremental inserts from the daily re-ingest.

### Consequences

- More memory and a slower index build.
- Re-ingest does not require an index rebuild.

---

## Decision D-006 - Contextual retrieval at chunk time

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Ingest |
| Status | accepted |
| Supersedes | - |

### Context

Benefit tables chunk badly. A chunk reading "the copay is $0" carries no indication of which benefit, plan or network tier it belongs to.

### Options considered

1. Plain chunking, rely on retrieval to compensate.
2. Prepend a generated context blurb to each chunk before embedding and lexical indexing.

### Decision

Generate a short context blurb per chunk at ingest and prepend it before embedding and indexing.

### Rationale

Anthropic's published numbers show a large drop in retrieval failure, and plan documents are exactly the case it helps - chunks that say "the copay is $0" with no indication of which benefit or plan.

### Consequences

- One LLM call per chunk at ingest time.
- Ingest becomes slower and non-trivial to re-run; prompt caching mitigates cost.

---

## Decision D-007 - Deterministic tools beat RAG where a structured lookup exists

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Retrieval architecture |
| Status | accepted |
| Supersedes | - |

### Context

Provider directories and formularies are tables. Semantic search over prose renderings of tables loses precision that a typed query keeps.

### Options considered

1. One retrieval path, RAG over everything.
2. Two paths - structured queries for tabular facts, RAG for rules and prose - with a router.

### Decision

Provider search and formulary tier lookup hit typed queries against structured data. RAG handles rules and explanations.

### Rationale

RAG is for explaining rules, not for retrieving facts that live in a table.

### Consequences

- Exact, verifiable answers for the two highest-volume lookup categories.
- Two retrieval paths and a router that has to pick correctly.
- See comment C-1: this is not in the frozen SRS.

---

## Decision D-008 - Voice is first-class input; text is the source of truth

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Voice |
| Status | accepted |
| Supersedes | - |

### Context

The audience is 65+, where typing is a barrier, but a spoken answer cannot carry a citation.

### Options considered

1. Voice as an accessibility add-on over a text product.
2. Voice as a first-class path, with text always rendered alongside.

### Decision

Voice is a first-class input path. Everything renders as text with citations even when spoken.

### Rationale

A spoken answer cannot be re-read and cannot show a source.

### Consequences

- Two output surfaces to build and keep in sync.
- The citation contract survives voice mode intact.

---

## Decision D-009 - ElevenLabs primary, Fish Audio fallback, circuit breaker

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Voice |
| Status | accepted |
| Supersedes | - |

### Context

Voice output needs a provider, and a single provider is a single point of failure in a live demonstration.

### Options considered

1. Single provider.
2. Primary plus fallback with a circuit breaker and a degrade path.

### Decision

ElevenLabs Flash v2.5 primary, Fish Audio fallback, with a circuit breaker and a silent degrade to text.

### Rationale

Latency drives whether voice feels conversational or broken.

### Consequences

- Two vendor integrations and a health check to maintain.
- See comments C-2 and C-3.

---

## Decision D-010 - Escalation is a designed feature, not a failure path

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Escalation |
| Status | accepted |
| Supersedes | - |

### Context

Most assistants treat handoff as the thing that happens when they fail, and design it last.

### Options considered

1. Escalation as an error state - a phone number on a refusal screen.
2. Escalation as a designed surface - always visible, carrying context.

### Decision

"Talk to a person" is permanently visible, and handoff carries the transcript so the member never repeats themselves.

### Rationale

Measuring escalation honestly is the only way to know if deflection is real.

### Consequences

- Gives up deflection that could otherwise have been claimed by making the human path harder to find.
- Turns a refusal into a shorter call rather than a failed one.

---

## Decision D-011 - Semantic cache with an exact-match tier in front

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Performance |
| Status | accepted |
| Supersedes | - |

### Context

Repeated questions cost latency and tokens, but caching a health answer against a near-miss is a correctness failure, not a performance one.

### Options considered

1. No cache.
2. Exact-match cache only.
3. Exact-match tier in front of a semantic tier with a high similarity threshold.

### Decision

Exact-match tier first, semantic tier behind it at a high similarity threshold.

### Rationale

Benefits FAQs repeat heavily, but a near-miss cache hit on a copay question is a wrong answer.

### Consequences

- Lower hit rate than a loose threshold would give.
- See comments C-4 and C-5.

---

## Decision D-012 - Evals are a merge gate, not a report

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Quality |
| Status | accepted |
| Supersedes | - |

### Context

Quality numbers that do not block anything drift downward silently.

### Options considered

1. Evals as a published report, reviewed by a human.
2. Evals as a CI gate that fails the build.

### Decision

A golden question set with expected sources runs in CI. Faithfulness below threshold fails the build.

### Rationale

A report is advisory; a gate is enforcement.

### Consequences

- The golden set has to be hand-written.
- Corpus and prompt changes cannot silently degrade answer quality.

---

## Decision D-013 - v1 is P1 only; the authenticated tier becomes v1.1

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Requirements |
| Status | accepted |
| Supersedes | - |

### Context

The stated scope boundary said public documents only, while `docs/ideas.md` had made the authenticated tier mandatory. Both could not be true.

### Options considered

1. v1 = P1 only, P2 becomes v1.1.
2. v1 = P1 + P2, retire the public-documents boundary.
3. v1 = P1 + P2, restate the boundary as "no real PHI."

### Decision

v1 is P1 only. P2, including authentication and synthetic member records, is v1.1 and is specified separately.

### Rationale

Keeps D-001's regulatory boundary intact and clean, and produces a shippable milestone before authentication exists.

### Consequences

- `claude/srs.md` covers P1 only; P2 through P4 appear there as explicit non-goals.
- Voice and reranking were pulled into P1 as a result, taking it from 13 items to 18.

---

## Decision D-014 - Faithfulness is the measurable success metric; deflection is the objective

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Requirements |
| Status | accepted |
| Supersedes | - |

### Context

Call volume cannot be observed without production traffic against a real call centre, so the business goal is not directly measurable in this build.

### Options considered

1. Containment rate plus self-reported resolution as the metric.
2. Eval faithfulness alone.
3. Faithfulness as a gate, containment as the metric.

### Decision

Faithfulness at or above 0.90 on the golden set is the measurable success metric. Deflection is stated as the business objective and explicitly not measured.

### Rationale

It is the number that can actually be defended. Anything containment-based in a case study is a proxy for a proxy.

### Consequences

- The SRS states plainly that call reduction was not measured, and does not claim the projection as a result.
- Instrumentation survives on a different justification: producing the top-unanswered list that drives corpus expansion.

---

## Decision D-015 - Cite-or-refuse binds per claim, not per turn

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Requirements |
| Status | accepted |
| Supersedes | - |

### Context

Retrieval frequently covers part of a question. Refusing the whole turn discards a usable answer; answering the whole turn invents the missing part.

### Options considered

1. Per claim - state what is supported, name the gap explicitly.
2. Per turn - any gap refuses everything.
3. Answer with a confidence caveat.

### Decision

Every supported claim is stated with its citation; every unsupported part is named explicitly as not found, followed by the human path.

### Rationale

Preserves D-003 without discarding half-answers the member could act on. Option 3 was rejected because hedged medical-adjacent language edges toward implying a coverage determination.

### Consequences

- Harder to test than a per-turn rule; needs its own acceptance scenarios.
- Refusals become partial and informative rather than binary.

---

## Decision D-016 - The reranker score is the sole confidence signal

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Requirements |
| Status | accepted |
| Supersedes | - |

### Context

"Weak retrieval" had to become a testable threshold before any acceptance scenario could be written.

### Options considered

1. Reranker score on the top chunk, with a floor.
2. Raw vector similarity threshold.
3. A model self-check before generating.
4. Reranker floor plus self-check in the ambiguous band.

### Decision

The top reranked score is compared against a configured floor. That single comparison decides answer versus refuse.

### Rationale

Reranker scores are better calibrated across question types than raw cosine similarity, and one tunable number is trivially testable and loggable.

### Consequences

- Reranking moves from P2 into P1; the refusal gate cannot exist without it.
- Creates a load-bearing open question - which reranker, under the zero-cost constraint.

---

## Decision D-017 - Golden set: generated questions, hand-pinned answers

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Requirements |
| Status | accepted |
| Supersedes | - |

### Context

If the same process authors both questions and expected answers from the same corpus, the eval measures self-agreement and proves nothing.

### Options considered

1. Generated questions, expected answers pinned by hand to page and section.
2. Fully hand-authored.
3. Fully generated, spot-checked.

### Decision

Questions are drafted from the call-driver taxonomy; every expected answer is verified by hand against the source document and recorded with its page or section.

### Rationale

It is the only version where the faithfulness number means anything.

### Consequences

- Roughly an hour of manual verification for fifty questions.
- Question phrasing still skews toward how the author thinks rather than how a member asks.

---

## Decision D-018 - Azure OpenAI for generation and embeddings

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Stack |
| Status | accepted |
| Supersedes | - |

### Context

The zero-cost constraint pointed at Gemini's free tier, but an already-owned Azure deployment was available.

### Options considered

1. Gemini free tier for generation and embeddings.
2. Azure OpenAI gpt-4o plus text-embedding-3-small on the existing deployment.
3. Fully local via Ollama.

### Decision

Azure OpenAI gpt-4o with API version 2025-01-01-preview for generation, text-embedding-3-small on the same resource for embeddings.

### Rationale

Gemini's free tier is capped at roughly 10 requests per minute, which would throttle a live demonstration, and Google may use free-tier inputs and outputs to improve their models. Azure OpenAI is BAA-eligible and does not train on submitted data, which also makes it the right pattern for v1.1 when data stops being public.

### Consequences

- Single vendor for both model calls; no second SDK.
- Cost is borne by an existing account rather than being genuinely zero.

---

## Decision D-019 - Corpus scoped to one plan year and one service area

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Corpus |
| Status | accepted |
| Supersedes | - |

### Context

A Medicare Advantage contract contains multiple plan benefit packages, each approved for a specific service area, each with its own documents and its own cost-sharing. "The Clover PPO" is not one document set.

### Options considered

1. One plan, one service area, one plan year.
2. Two plans, to prove the plan selector is load-bearing.
3. All eleven states, both contract types.

### Decision

2026 plan year, Clover PPO, a single service area. Documents from any other plan year are rejected at ingest rather than filtered at query time.

### Rationale

Small enough that every answer can be hand-verified against its source, which is what makes the eval numbers credible. Option 3 makes correctness unverifiable by hand.

### Consequences

- Dissolves the wrong-plan-year retrieval failure mode entirely - a stale chunk cannot be in the index.
- The plan selector ships with one real option and the rest marked not yet indexed.

---

## Decision D-020 - Evidence of Coverage wins on source conflict

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Answer contract |
| Status | accepted |
| Supersedes | - |

### Context

The Summary of Benefits summarises the Evidence of Coverage. They can disagree, and retrieval can surface both.

### Options considered

1. Precedence order, EOC wins.
2. Refuse on any detected conflict.

### Decision

The Evidence of Coverage takes precedence as the legally controlling document, and the conflict is stated in the answer rather than hidden.

### Rationale

The EOC is the controlling document; suppressing the conflict would hide information the member needs.

### Consequences

- Requires conflict detection across retrieved chunks, not just ranking.
- Answers occasionally become longer and more caveated than the member wanted.

---

## Decision D-021 - Never fall back to parametric knowledge

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Failure modes |
| Status | accepted |
| Supersedes | - |

### Context

If the datastore is unreachable, a language model will happily answer a Medicare question from training data, and the answer will look identical to a grounded one.

### Options considered

1. Refuse outright when retrieval returns nothing.
2. Degrade to a general answer with a warning.

### Decision

Zero retrieved chunks produces a refusal, always. There is no degraded answering mode.

### Rationale

This is the one failure that would violate the entire cite-or-refuse contract while appearing to work correctly.

### Consequences

- A datastore outage becomes a visible outage rather than a silent correctness failure.
- Specified as a functional requirement, not as error handling, so it is tested.

---

## Decision D-022 - Plan context is requested lazily

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | UX |
| Status | accepted |
| Supersedes | - |

### Context

Cost-sharing varies by plan, so an unscoped copay answer is a wrong answer. But a picker in front of the first message is friction at the exact point members abandon.

### Options considered

1. Lazy - prompt only when a question needs plan scope.
2. Required up front before any answer.
3. Default to the dominant plan with a visible way to change it.

### Decision

Members ask freely. When a question requires plan scope, the assistant asks before answering and retains the answer for the session.

### Rationale

A blank form between the member and their question is the main abandonment point for this audience. Option 3 was rejected because a member on a different plan gets a confidently wrong copay and never notices the assumption.

### Consequences

- Requires classifying which questions are plan-scoped, which is the same classifier that will later gate authentication.
- No plan-scoped answer can be generated before context is set.

---

## Decision D-023 - Refusal rate bands at 20% and 35%

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Quality |
| Status | accepted |
| Supersedes | - |

### Context

A tracked number with no threshold cannot be enforced, and a threshold set too tight creates pressure to lower the confidence floor.

### Options considered

1. Above 20% is a corpus problem, above 35% fails the build.
2. Above 10% is a corpus problem.
3. Tracked and published, no threshold.

### Decision

Refusal rate above 20% on the golden set is treated as a corpus deficiency to fix by expanding the corpus. Above 35% fails the build. Lowering the confidence floor to improve the number is prohibited.

### Rationale

Roughly matches the estimate in `docs/call-drivers.md` that a third of bucket A questions may not be fully resolvable from a single-plan corpus, and leaves room for correct refusals on adversarial questions.

### Consequences

- The explicit prohibition is load-bearing; without it the metric incentivises trading refusals for wrong answers.
- The 20% figure inherits the low confidence of the estimate it derives from.

---

## Decision D-024 - Latency measured under throttled CI plus a real-device check

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Performance |
| Status | accepted |
| Supersedes | - |

### Context

"Mid-range phone over LTE" is not a measurable definition, so none of the four latency budgets were testable as written.

### Options considered

1. Chrome DevTools mobile throttling in CI, plus a manual real-device pass.
2. A named real device only.
3. Server-side timings only.

### Decision

4x CPU slowdown and Slow 4G, run headless in CI and regression-gated there, with a manual pass on a real mid-range Android before any demonstration.

### Rationale

Reproducible enough to gate automatically, real enough to catch what simulation misses. A named device alone gets measured once and never again; server-side timings exclude the network and render time the requirement is actually about.

### Consequences

- All four latency NFRs become enforceable.
- Throttled CI numbers will not match the real device exactly; the manual pass is the reconciliation.

---

## Decision D-025 - Caregiver is a secondary persona

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Requirements |
| Status | accepted |
| Supersedes | - |

### Context

CMS's definition of communications covers current enrollees "and their caregivers," and export and print exist largely for them, but no persona list included them.

### Options considered

1. Secondary persona, no caregiver-specific features.
2. Member only.
3. Member, caregiver, and a Clover service agent as an internal third.

### Decision

Caregiver appears as a secondary persona with its own primary need. No caregiver-specific features and no access to member data.

### Rationale

Justifies the export and answer-format decisions and matches the regulatory definition, without adding a feature surface.

### Consequences

- Answer format is shaped toward something shareable and verifiable by a third party.
- No delegated access, at any priority.

---

## Decision D-026 - Placeholder phone number, working mock callback form

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Escalation |
| Status | accepted |
| Supersedes | - |

### Context

The deployment is a public, unaffiliated page carrying Clover styling. Publishing a real support line on it can route real calls to a real team that never agreed to it.

### Options considered

1. Placeholder number, working mock callback form.
2. Real Clover number.
3. Real number behind a password-protected deployment.

### Decision

An obviously-fake number with a note that the real deployment uses Clover's line. The callback form validates, stores and confirms, so the flow is demonstrable end to end.

### Rationale

Removes any possibility of sending real members to a real call centre from an unaffiliated site, while keeping the escalation flow real rather than decorative.

### Consequences

- Slightly less realistic in the walkthrough.
- The escalation payload is still a designed artifact, per D-010.

---

## Decision D-027 - Scope by call driver, not by feature

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Product scoping |
| Status | accepted |
| Supersedes | - |

### Context

Feature-grouped priorities do not answer whether the product addresses what members actually call about, which is the unit the goal is stated in.

### Options considered

1. Keep feature-based priority groups only.
2. Add a call-driver taxonomy splitting drivers into public-answerable, auth-required, and never-automate.

### Decision

`docs/call-drivers.md` classifies 37 call drivers into buckets A, B and C. Bucket A is v1 scope, B is the roadmap, C is the guardrail specification.

### Rationale

The success metric is stated in calls, so scope should be cut in calls. Bucket C in particular becomes an implementable refusal specification rather than a general instruction to be careful.

### Consequences

- Supersedes the generic safety-refusal item with ten specified triggers.
- Restructures the eval harness by bucket.
- The share estimate underlying it is inference, not evidence, and is labelled as such throughout.

---

## Decision D-028 - Rotating tips, coach marks and document upload restored at P4

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Backlog |
| Status | accepted |
| Supersedes | - |

### Context

Three features were argued out of scope on accessibility and compliance grounds and were subsequently reinstated by the user at lowest priority.

### Options considered

1. Remain cut.
2. Reinstated at P4 with binding build conditions.

### Decision

All three sit at P4. Rotating tips require a pause control and must not occupy the answer region. Coach marks require correct focus handling and must be re-openable from the help panel. Document upload is available only inside an authenticated session, and ships only with the coverage-determination boundary extended to uploads, prompt-injection defences, file limits, and real deletion.

### Rationale

The original objections were about specific harms, not about the features existing. Attaching the conditions addresses the harms without overriding the user's call.

### Consequences

- The build conditions become acceptance criteria, not prose.
- Document upload turns a closed corpus into an open one, making prompt injection a live threat rather than a theoretical one.

---

## Decision D-029 - Permanent cuts

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Backlog |
| Status | accepted |
| Supersedes | - |

### Context

Three proposed items were rejected outright rather than deferred.

### Decision

Not built at any priority: keyboard shortcut chords labelled on interface elements; in-app font-size controls; phone and IVR interception, SMS, and an agent-assist console.

### Rationale

Phone users have no keyboard and custom Ctrl+Shift bindings collide with screen-reader keymaps. Browser and OS zoom already provide text scaling system-wide, and guaranteed reflow at 200% makes an in-app control redundant. The additional channels are higher-leverage than web chat at real scale but are outside this product's stated single-channel scope.

### Consequences

- The reasoning is a deliverable in its own right; a well-argued cut is worth more in the interview dialogue than a marginal feature.
- The other-channels cut forecloses the strongest scale argument available, which is agent-assist touching 100% of calls rather than a fraction.

---

## Decision D-030 - Corpus discovery through the plan-documents API, snapshotted and replayed

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Corpus spike (P1 Stage 1) |
| Status | accepted |
| Supersedes | - |

### Context

Clover's plan-documents page renders no document links in server HTML; it is a React app. Reconnaissance found two undocumented JSON endpoints behind it: `/api/zipcode/counties?zipcode=<zip>` and `/api/plans/document-search?county_id=<fips>&year=<yyyy>`. The second returns a structured catalog carrying contract id, plan id, plan year, network type, drug-coverage flag, and direct CDN URLs for Summary of Benefits, Evidence of Coverage and ANOC. `robots.txt` is `Allow: /` and places no restriction on these paths.

The fetcher needs a source of truth for what to download. An undocumented endpoint is a dependency that can change without notice; a hardcoded URL list goes stale without saying so.

### Options considered

1. Live API discovery on every run. Self-updating, but nothing runs offline and the endpoint is a single point of failure.
2. Pinned URL list committed to the repo. Reproducible, but stale silently, and the nightly upstream-drift test in `docs/testing-strategy.md` §8 could not exist.
3. Discovery snapshot, replayed. `--discover` hits the API and writes a timestamped catalog snapshot; the default run replays the committed snapshot.

### Decision

Option 3. `corpus:fetch --discover` calls the API and writes a timestamped snapshot containing the verbatim catalog response. `corpus:fetch` without the flag replays the most recent committed snapshot. Conversion always reads from a named snapshot.

### Rationale

Reproducibility and drift detection are both required and this is the only option delivering both. Re-running `--discover` and diffing against the committed snapshot is the nightly upstream-drift test, at no additional cost. The snapshot is also the immutable identified artifact Stage 4 needs for ingest idempotency, arriving one stage early for roughly one flag and one branch of extra code. If the undocumented endpoint disappears, the committed snapshot still builds the corpus and the failure surfaces as a loud diff rather than a silent 404.

### Consequences

- Two code paths in the fetcher rather than one.
- Committed snapshots make the corpus auditable: any answer traces to a catalog response captured at a known time.
- The project now depends on an endpoint Clover does not document and owes no stability guarantee. The replay path is the mitigation, not a fix.
- `zipcode=` is accepted by the endpoint and silently ignored; only `county_id` filters. Passing the wrong parameter returns all ten plans across five states with no error, so the fetcher must assert the returned set is county-scoped rather than trusting the request.

---

## Decision D-031 - Summary of Benefits columns disambiguated by bounding-box x-position

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Corpus spike (P1 Stage 1) |
| Status | accepted |
| Supersedes | - |

### Context

The 2026 NJ Summary of Benefits is a single PDF covering two plans side by side, 004 and 007. Converted with `pdftotext -layout`, both plans' amounts land on one text line - `Specialist visit: $10 copay` and `Specialist visit: $2 copay` - and the header naming the columns appears once per page section, roughly eighteen lines above the rows it governs.

A chunker reading that output has no way to attribute an amount to a plan. The resulting answer would retrieve real content, cite a real document, pass a faithfulness check, and be wrong for one of the two plans, on the highest-volume bucket A call driver.

### Options considered

1. Character-offset splitting. Split each `-layout` line at a fixed column derived from the header row.
2. Bounding-box splitting. Use `pdftotext -bbox-layout`, which emits per-word x and y coordinates, and assign each word to a plan column by x-position.
3. Drop the Summary of Benefits and cite cost-sharing from the Evidence of Coverage only, which is single-column and plan-specific.

### Decision

Option 2. The Summary of Benefits is converted with `-bbox-layout` and each word assigned to plan 004 or 007 by x-position against the detected header. Only the 004 column is emitted. The Evidence of Coverage and formulary are single-column and continue to use plain `-layout`.

### Rationale

Option 1 fails silently: any row whose benefit name wraps past the split column places text in the wrong plan, producing exactly the defect this decision exists to prevent, with no signal that it happened. Option 3 is safe but discards the document members are actually mailed and the most readable cost-sharing summary in the corpus. Option 2 is deterministic, unit-testable against known coordinates, and adds no package.

### Consequences

- Two conversion modes to maintain rather than one.
- Column detection must fail loudly. A page where the header cannot be located is a conversion failure, not a page emitted with unattributed amounts.
- Qualifies D-019. "One plan, one service area" does not hold at the document level, because the source document is inherently two-plan. Scope cannot assume the ambiguity away; conversion has to resolve it.
- The same pattern will recur for any plan pair sharing a Summary of Benefits, which from the catalog is all of them.

---

## Decision D-032 - Plan benefit package H5141-004, Clover Health Choice (PPO), Hudson County NJ

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Corpus spike (P1 Stage 1) |
| Status | superseded by D-033 |
| Supersedes | - |

### Context

`claude/srs.md` §10 carries this as a load-bearing open question: D-019 fixed the corpus at one plan year and one service area but did not name which. New Jersey was confirmed by the user. Hudson County (FIPS 34017) resolves to six 2026 plans under contracts H5141 and H8010, four of them PPO.

### Options considered

1. H5141-004, Choice (PPO), with Part D.
2. H5141-054, Choice Giveback (PPO), with Part D.
3. H5141-061, Valor (PPO), without Part D.
4. Defer, and fetch all four NJ PPO plans.

### Decision

H5141-004, Clover Health Choice (PPO), 2026, Hudson County NJ.

### Rationale

PPO as D-019 requires, and `rx_coverage: true`, so formulary call drivers stay answerable. Option 3 has no drug coverage and would have silently removed an entire call-driver class from the demo. Option 2 shares its Summary of Benefits with Valor-061, pairing a Part D plan against a non-Part D plan in one comparison table, which is a worse column-confusion case than the 004/007 pairing.

### Consequences

- Resolves the load-bearing open question in `srs.md` §10. That checklist item can be closed.
- The Summary of Benefits is shared with plan 007, which is what makes D-031 necessary.
- The plan selector ships with one real option, per D-019's existing consequence.
- Contract id H5141 and plan id 004 become required provenance fields on every chunk, per FR-04 and FR-06.

---

## Decision D-033 - Two plan benefit packages, H5141-004 and H5141-007

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Corpus spike (P1 Stage 1) |
| Status | accepted |
| Supersedes | D-032 |

### Context

D-032 fixed the corpus at one plan benefit package, H5141-004, following D-019's "one plan, one service area". D-019's own consequence conceded the cost: "the plan selector ships with one real option and the rest marked not yet indexed." FR-10 and FR-11 - plan context requested lazily, never answer a plan-scoped question without it - were therefore specified but not demonstrable, because with a single plan the picker is decorative.

Hudson County NJ carries four PPO plans. They pair into two Summary of Benefits documents rather than four: 004 with 007, and 054 with 061.

### Options considered

1. One plan, 004. The picker stays decorative.
2. Two plans, 004 and 007. They share one Summary of Benefits and both carry Part D.
3. All four NJ PPO plans. Two shared Summary of Benefits documents, one of which pairs a Part D plan with a plan that has none.

### Decision

Two plans: H5141-004 Clover Health Choice (PPO) and H5141-007 Clover Health Choice Value (PPO), 2026, Hudson County NJ.

### Rationale

Two plans make FR-10 and FR-11 demonstrable rather than asserted: the assistant can be shown asking which plan a member is on and returning two different correct copays, which argues the safety case live instead of describing it. The pair shares a single Summary of Benefits, so the cost is one converter change and one additional Evidence of Coverage. Both carry Part D, so no plan-conditional refusal rule is needed.

Option 3 was rejected for what it adds rather than what it costs to fetch. Valor-061 has `rx_coverage: false`, so formulary questions would be answerable for three plans and would have to refuse for the fourth - a plan-conditional refusal that appears nowhere in FR-21, whose triggers are all content-based. Its Evidence of Coverage is also named `eoc_nj_pa__ppo_061`, suggesting one document serving two states, which would introduce out-of-service-area provenance the corpus does not otherwise have. Neither buys demo value that two plans do not already deliver.

### Consequences

- The Summary of Benefits column extractor must support the right-hand column. Plan 007 sits there, and the benefit-label column is on the far side of plan 004's column, so extraction needs three zones and two gutters rather than one boundary.
- **Cross-plan leakage stops being hypothetical.** `docs/testing-strategy.md` §4 lists a near-duplicate chunk from a different plan with a different amount as an adversarial fixture. With two indexed plans it is the real corpus: "what is my specialist copay" retrieves near-identical chunks reading $10 and $2. Retrieval must filter on plan id before ranking, not after, because the reranker scores prose similarity and the two chunks are interchangeable by that measure. This lands in Stage 4, not Stage 1.
- The golden set in Stage 5 must carry plan context on every cost question, and hand-verification of pinned answers roughly doubles.
- Chunk provenance carries plan id alongside contract id. FR-04 and FR-06 already require the contract identifier; plan id is the finer key that actually separates these two documents.
- Qualifies D-019 further, alongside D-031. "One plan" is now "one contract, one service area, two plan benefit packages."

---

## Decision D-034 - Gemini as generation fallback, never for embeddings

| Field | Value |
| --- | --- |
| Date | 2026-09-07 |
| Cycle / Feature | Stack (P1 Stage 3) |
| Status | accepted |
| Supersedes | - |

### Context

D-018 chose Azure OpenAI for generation and embeddings and explicitly rejected Gemini, on two grounds: the free tier is capped near 10 requests per minute, and Google may use free-tier inputs and outputs to improve their models. D-018's stated consequence was "single vendor for both model calls; no second SDK."

FR-25 requires an upstream failure to produce an explicit error state rather than a silent one, and FR-09 forbids answering from parametric knowledge under any circumstance. Neither requires a second provider. A live demonstration with a single generation provider fails completely if that provider is unavailable.

### Options considered

1. Azure only. An outage ends the demonstration; FR-25 shows the error state.
2. Azure primary, Gemini fallback for generation only.
3. Azure primary, Gemini fallback for both generation and embeddings.

### Decision

Azure OpenAI primary. Gemini as a generation fallback only. Embeddings stay on Azure `text-embedding-3-small` with no fallback.

### Rationale

Option 3 is unsafe in a way that is easy to miss. Embeddings from two providers occupy different vector spaces, so a query embedded by Gemini and compared against a corpus embedded by Azure returns results that are numerically valid and semantically meaningless. Retrieval would not error; it would quietly return the wrong chunks, which under cite-or-refuse produces a confidently cited wrong answer. If Azure embeddings are unavailable there is nothing to retrieve against, so the correct behaviour is refusal per FR-09, not a second embedding space.

Generation is different. The chunks are already retrieved and are passed in the prompt, so a fallback generator is reading from the same evidence and citing the same chunk identifiers. FR-32's structural validation applies to its output exactly as it does to Azure's.

### Consequences

- **Google may train on free-tier inputs.** FR-31 redacts identifier-shaped strings before they reach a log or store, but that redaction protects persistence, not the model call. A member typing a member id while Azure is down sends that text to Google. Redaction must therefore run before the model call, not only before logging, and that is now a requirement rather than an implementation detail.
- The corpus is public documents, so the retrieved context carries no protected information. The exposure is confined to member-typed question text.
- Gemini's free tier is capped near 10 requests per minute, so the fallback degrades under load rather than restoring full service.
- Contradicts D-018's "no second SDK" consequence. Mitigated by calling both providers over raw `fetch` against their REST endpoints rather than adding either vendor SDK.
- The member must be told which provider answered when the fallback is in use, consistent with FR-20's rule for the voice chain that a degraded path is disclosed rather than hidden.

---

## Decision D-035 - Contextual prefixes derived from headings, generated only for orphans

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Full ingest (P1 Stage 4) |
| Status | accepted |
| Supersedes | - |

### Context

D-006 requires a short generated blurb prepended to each chunk before embedding and lexical indexing. Taken literally that is one model call per chunk. The full corpus is 1476 chunks, so every ingest would cost 1476 calls and roughly twenty minutes, repeated on every re-ingest.

The purpose of D-006 is that a chunk reading "The copay is $0." is not context-free. Most chunks already sit under a heading path that states exactly that: `Chapter: Medical Benefits Chart > Your medical benefits`, or `ANALGESICS > OPIOID ANALGESICS, LONG-ACTING`.

### Options considered

1. A model call for every chunk, D-006 as written.
2. Deterministic prefix from document kind, plan and heading path; the model only for chunks with no heading to inherit.
3. Deterministic only, with no model call at all.

### Decision

Option 2. The prefix is `{kind}, {contract}-{plan}, plan year {year}. {heading path}.` built without a model. Chunks whose heading path is empty are flagged and sent to the model for a one-sentence description. Measured on the real corpus, that is 28 of 1476 chunks, 1.7%.

### Rationale

The headings already carry what D-006 wants, and they carry it deterministically, which matters more than it first appears: a generated prefix differs every run, so ingest reports unchanged chunks as changed and re-embeds the entire corpus forever. Option 1 is therefore not only expensive but incompatible with NFR-OPS-01's idempotency requirement. Option 3 leaves the orphan case, which is the one D-006 was written for, unsolved.

### Consequences

- Ingest costs 28 model calls rather than 1476.
- Generated prefixes are frozen to `data/snapshots/<id>/context-prefixes.json` and reused, so a second ingest reports zero changes. This was discovered by ingest reporting a permanently changed chunk, not by reasoning.
- The prefix quality now depends on heading detection quality per document kind, which moves the risk into the chunker where it is testable.
- A failed generation falls back to the deterministic prefix plus "Context could not be generated", so ingest is never blocked and the gap is visible rather than silent.

---

## Decision D-036 - Pharmacy directory excluded from the index

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Full ingest (P1 Stage 4) |
| Status | accepted |
| Supersedes | - |

### Context

The 2026 NJ pharmacy directory is 133 pages of pharmacy names, addresses and phone numbers. Chunked as prose it produces roughly 175 near-identical rows. D-007 already decided that a structured lookup beats semantic search where the source is a table, and deferred that work to P2.

### Options considered

1. Index both formulary and pharmacy directory as prose.
2. Index the formulary, exclude the pharmacy directory.
3. Exclude both, deferring all tabular sources to P2.

### Decision

Option 2. The formulary is indexed; the pharmacy directory is excluded, and the exclusion is recorded as a rejection with its reason on every ingest run.

### Rationale

Drug tier is a high-volume bucket A call driver and the formulary answers it in prose that retrieval handles well, demonstrated by ORSERDU ranking first under fusion. A pharmacy directory answers "which pharmacy near me", which is a proximity query over addresses. Semantic search cannot answer it correctly, and hundreds of near-identical address rows dilute lexical scoring for every other question.

### Consequences

- "Which pharmacies are in network near me" is unanswerable in v1 and must refuse. It is a bucket A driver that v1 does not cover, and that gap is now explicit rather than dressed up as a wrong answer.
- Removes roughly 175 low-value chunks that would otherwise compete in every lexical query.
- The exclusion lives in one named constant, `EXCLUDED_KINDS`, so reversing it when P2 adds structured lookup is a one-line change.

---

## Decision D-037 - Reranker is a local ONNX cross-encoder

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Eval harness (P1 Stage 5), consumed by Stage 6 |
| Status | accepted |
| Supersedes | - |

### Context

`claude/srs.md` section 10 carries this as the last load-bearing open question. FR-03 and D-016 make the reranker score the sole signal deciding whether the assistant answers or refuses, so Stage 6 cannot begin without one. The zero-cost constraint rules out paid reranking APIs.

### Options considered

1. A local ONNX cross-encoder running in process. Zero cost and no rate limit, but a new dependency and a model file to ship.
2. A hosted free tier. No local dependency, but a rate limit on the hot path and a provider that can withdraw the tier, as Fish Audio did during this project.
3. Raw fusion score as the confidence signal, already rejected during requirements because Reciprocal Rank Fusion scores are not calibrated across question types.

### Decision

A local ONNX cross-encoder. The specific model is chosen in Stage 6 by measuring at least two candidates against the golden set, per the plan's instruction to pick on measured accuracy rather than preference.

### Rationale

The reranker sits on the hot path of every turn and inside NFR-PERF-02's 800ms time-to-first-token budget. A hosted call adds network latency plus a rate limit to the one component that decides whether an answer is safe to give, and a free tier that disappears takes the refusal gate with it. Local inference has a fixed cost that cannot be revoked.

### Consequences

- Adds an ONNX runtime dependency and a model file, the largest addition to the toolchain so far. It needs explicit approval before installation, and its size affects the deploy target chosen in Stage 10.
- Reranking latency becomes a local CPU cost inside the NFR-PERF-02 budget, so it must be measured rather than assumed.
- Resolves the last load-bearing open question in `srs.md` section 10.
- The confidence floor is calibrated against the golden set once a model is chosen, which is only possible because Stage 5 built the golden set first.

---

## Comments on rationale and conflicts

Collected here rather than inside the entries, so the entries stay as stated.

### Thin rationale

**T-1 (D-009).** The stated reason - "latency drives whether voice feels conversational or broken" - argues for a low-latency vendor. It does not argue for ElevenLabs over any other low-latency vendor, and it does not argue for Fish Audio as the fallback at all. Fish is currently the weaker half of the pair: its free S2.1 Pro text-to-speech window closed on 31 August 2026, so it is not a free fallback as of the date of this decision, and its speech-to-text free tier is personal-use only. The native browser speech synthesiser is the only tier in the chain that cannot be exhausted, and it is doing more work in this decision than the stated rationale acknowledges.

**T-2 (D-011).** "Benefits FAQs repeat heavily" is asserted without evidence. Nothing in `docs/research-init.md` or the assignment establishes a repeat rate, and no traffic exists to measure one. The correctness half of this decision - a high threshold because a near-miss on a copay is a wrong answer - is well argued and stands on its own. The performance half rests on an unverified premise.

**T-3 (D-007).** The decision is well argued; the routing is not. "A router that has to pick correctly" is listed as a cost, but no reason is given for how it decides, and that is the part most likely to fail. A router that misclassifies "what tier is my drug" as a rules question silently degrades a structured lookup back to semantic search over prose, which is the exact failure the decision exists to prevent. This needs a decision of its own before implementation.

### Conflicts with the frozen SRS

`claude/srs.md` is frozen at version 1.0.0. Four of these decisions sit outside it and need reconciling before the build starts. The SRS cannot absorb them silently; it has to be amended and its version bumped, or the decisions have to be scoped to a later release.

**C-1 (D-007).** Deterministic tools for provider search and formulary lookup are not in the SRS. FR-02 specifies hybrid retrieval as the only path, and FR-01 indexes the provider directory and formulary as documents rather than as structured data. This is a material architectural change affecting FR-01, FR-02 and FR-03, and it adds a router that no functional requirement or acceptance scenario currently covers.

**C-2 (D-009).** "Silent degrade to text" contradicts FR-20, which requires that the member be told the voice has changed rather than left to wonder. Both are defensible; they cannot both ship. My reading is that silence is the wrong choice here specifically because an audience with low trust in AI reads an unexplained change as a fault, but this is the user's call.

**C-3 (D-009).** The circuit breaker itself is not in the SRS. FR-20 specifies a provider chain and a cache but no health check and no breaker state.

**C-4 (D-011).** Semantic caching appears in SRS section 8 as a v1.3 non-goal. D-011 does not state a release, so it currently reads as in-scope. If it is v1 the SRS is wrong; if it is v1.3 the decision should say so.

### Drift worth noting

**N-1 (D-001).** The stated rationale cites shipping "in 40 hours." That constraint was lifted earlier in this session, and `docs/ideas.md` and `claude/srs.md` were both written without it. The decision itself is unaffected - the HIPAA-scope argument stands on its own - but the reason as written references a constraint that no longer applies.

**N-2 (D-001).** "Reverse when there's a BAA and an auth story" sits oddly beside D-013, where v1.1 adds authentication over synthetic records with no BAA and none needed. The reversal condition as stated is stricter than what v1.1 actually does.

**N-3 (D-005).** "The daily re-ingest" is the first appearance of an ingest cadence anywhere in the project. NFR-OPS-01 requires the pipeline to be idempotent but specifies no schedule. Either the cadence is a decision that has not been recorded, or the phrase is incidental.

**N-4 (D-010).** "Measuring escalation honestly is the only way I'll know if deflection is real" is the right instinct, but D-014 settled that deflection is explicitly not measured in v1 and faithfulness is the metric instead. Escalation is still logged per FR-26, so the measurement exists; it simply is not the success criterion this rationale implies it is.
