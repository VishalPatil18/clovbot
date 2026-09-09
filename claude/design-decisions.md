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

### Measured, 2026-09-08

Two candidates against the golden set, pool of 20. Full output in `eval/results/rerank-spike.json`.

| Model | accuracy@1 | accuracy@5 | latency | size |
| --- | --- | --- | --- | --- |
| `Xenova/ms-marco-MiniLM-L-6-v2` | 66.7% | 96.3% | 530ms | 23MB |
| `Xenova/ms-marco-MiniLM-L-12-v2` | 66.7% | 100% | 1043ms | 34MB |

Chosen: **L-6-v2**. accuracy@1 is tied, and L-12's better top-5 recall costs twice the latency inside an 800ms time-to-first-token budget that also has to cover retrieval and generation. At a pool of 10 rather than 20, L-6 runs at roughly 280ms.

### Consequences

- Adds an ONNX runtime dependency and a model file, the largest addition to the toolchain so far. Installed as `@huggingface/transformers@4.2.0`, which bundles the runtime and the tokenizer, rather than `onnxruntime-node` plus a hand-written tokenizer.
- **The absolute score turned out not to be usable as the confidence signal**, which is what D-038 amends. Ordering is sound; the scalar collapses on conversational phrasing.
- Reranking latency becomes a local CPU cost inside the NFR-PERF-02 budget, so it must be measured rather than assumed.
- Resolves the last load-bearing open question in `srs.md` section 10.
- The confidence floor is calibrated against the golden set once a model is chosen, which is only possible because Stage 5 built the golden set first.

---

## Decision D-038 - The structured payload is the answer contract; the reranker score is a coarse relevance gate

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Answer contract (P1 Stage 6) |
| Status | accepted |
| Supersedes | amends D-016 |

### Context

D-016 made the top reranked score the sole signal deciding whether the assistant answers or refuses. Stage 6 measured that assumption against the golden set with a local ONNX cross-encoder, and it does not hold.

The same question, asked two ways:

| Question | Terse phrasing | As a member would say it |
| --- | --- | --- |
| Emergency room copay | 0.9956 | 0.0329 |
| Primary care copay | 0.9980 | 0.0005 |
| Worldwide emergency | 0.9982 | 0.0002 |
| Specialist visit cost | 0.9979 | 0.0090 |

Genuinely out-of-corpus questions score at most 0.0002. A member asking about emergency cover before visiting their daughter abroad therefore scores in the same range as "what is the capital of France". The cross-encoder is trained on short keyword search queries, so it reads conversational speech as irrelevant, and conversational speech is how the target audience talks. `docs/build-journal.md` identifies engagement as the highest-elasticity term in the deflection estimate, so a floor that refuses rambling questions attacks the product's main lever.

The failure is confined to the absolute score. Ranking is sound: accuracy@5 was 96.3% for L-6 and 100% for L-12.

### Options considered

1. Keep D-016 and set the floor at the measured optimum, 0.001. Honest, but the gate is nearly inert.
2. Normalise the question into a terse search query before reranking. Restores the scores, but adds a pre-generation model call, which NFR-PERF-02 requires to fit inside the 800ms time-to-first-token budget or leave the hot path.
3. Make FR-32's structured payload the contract, and demote the score to a coarse relevance gate.

### Decision

Option 3. The reranker orders candidates, which it does well. The floor is 0.001, calibrated to catch questions with nothing relevant at all: measured 0 false answers on 10 out-of-corpus questions and 2 false refusals on 28 answerable ones. The answer-or-refuse contract is enforced by the structured payload: each claim carries its own citation ids, a claim without one fails validation and is never rendered, unanswered parts are a separate list, and refusal is a typed branch.

### Rationale

Stage 5 measured the actual failure mode, and it was not retrieval. Twelve of seventeen bucket A failures were uncited factual sentences, which is one named requirement rather than a diffuse quality problem. A scalar threshold cannot fix that; a schema that makes an uncited claim unrepresentable can. Option 2 buys back a number that was only ever a proxy, at the cost of latency on the hot path.

### Consequences

- D-016's "single signal" property is gone. The gate is now schema validation plus citation containment, both deterministic, plus a threshold that catches only nonsense.
- The reranker still earns its place, for ordering and for the coarse gate, so D-037 stands.
- The score and floor are still recorded on every turn per FR-03, so the decision remains auditable.
- Refusal becomes explicit rather than inferred from citation count, which is what Stage 5 found the old heuristic could not do.
- Bucket C guardrails remain Stage 8's problem. Measured here, bucket B and C questions score near zero, so they are intent refusals rather than confidence refusals, and a threshold was never going to catch them.

---

## Decision D-039 - Automated source-conflict detection removed

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Answer contract (P1 Stage 6) |
| Status | accepted |
| Supersedes | - |

### Context

FR-07 and D-020 require the Evidence of Coverage to win where sources conflict, with the conflict stated rather than hidden. The first implementation detected conflicts by comparing dollar amounts in retrieved EOC chunks against amounts in Summary of Benefits chunks, and told the model a conflict existed.

Run against the real corpus it fired on `$60 vs $0` and `$40 vs $0`, comparing an EOC chunk about outpatient hospital services with a Summary of Benefits chunk about doctor's office visits. Different benefits entirely. Told a conflict existed, the model asserted that the Summary of Benefits "incorrectly states" an out-of-network specialist copay of $25, a figure that appears nowhere and contradicts the hand-verified $20.

### Options considered

1. Keep the detector and require the chunks to share a benefit term.
2. Remove the detector and carry FR-07 as a standing instruction that the Evidence of Coverage controls.
3. Keep the detector but use it only to annotate the turn log, never to steer generation.

### Decision

Option 2. The detector is removed. The system prompt states that where the Evidence of Coverage and the Summary of Benefits disagree, the Evidence of Coverage controls and the disagreement must be stated. FR-07 is demonstrated by a controlled test using genuinely conflicting chunks rather than by a heuristic running in production.

### Rationale

Matching amounts across chunks cannot establish that two sources are talking about the same benefit, and option 1 needs exactly that to be safe. A detector that fires spuriously is worse than none, because it converts a false positive into a confident false statement that a real Clover document is wrong. That is a cite-or-refuse integrity failure, not a quality nit.

### Consequences

- Conflicts are surfaced only when the model sees both amounts in the same retrieved context and recognises them as the same benefit. Some real conflicts will go unstated.
- FR-07 coverage becomes a tested property of the prompt rather than a code path, so the test carries the whole guarantee.
- A precise detector remains possible once benefits are structured data, which is the P2 work D-007 already describes.

---

## Decision D-040 - Accessibility verification tooling deferred to P3

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Chat surface (P1 Stage 7) |
| Status | accepted |
| Supersedes | - |

### Context

Stage 7 has eleven acceptance criteria. Five of them require browser tooling: an automated axe scan on three routes, a keyboard-only walk, computed-style assertions for focus and target size, reflow at 200% zoom, and a Lighthouse run under the NFR-PERF-05 throttled profile. `docs/build-journal.md` already named this the largest known gap in the toolchain.

The user approved `@playwright/test`, `@axe-core/playwright` and Lighthouse, and directed that they land at P3 rather than in Stage 7.

### Options considered

1. Install the tooling now and satisfy the criteria as written.
2. Approve the tooling and defer it to P3, building to the standard and hand-verifying.
3. Drop the criteria.

### Decision

Option 2. Stage 7 ships the surface built to WCAG 2.2 AA with a static audit in `tests/unit/a11y-static.test.ts`, and the five browser-dependent criteria are recorded as unverified rather than claimed.

### Rationale

The user's call, taken after the tension was put to them: accessibility was made the priority in the same exchange that deferred its automated verification. Recording the override keeps the two statements consistent rather than letting the second quietly cancel the first.

### Consequences

- **Stage 7 ships with WCAG conformance asserted, not tested.** `docs/testing-strategy.md` section 7.4 exists to reject exactly this position, and it is now the project's largest verification gap.
- The static audit covers what is checkable without a browser: no font size below 18px, a 44px shared target minimum applied to buttons, inputs and starter controls, a focus ring of at least 2px never removed, no hover rule that reveals or hides content, reduced-motion honoured, and the presence of the FR-13, FR-15, FR-30 and NFR-SEC-01 surfaces. Twenty-two assertions.
- Still unverified: real contrast ratios, screen-reader reading order, keyboard trap behaviour, actual rendered target sizes, reflow at 200% zoom, and both latency budgets under throttling.
- The static audit is a regression guard, not a conformance claim. It cannot be cited as evidence the product meets NFR-A11Y-01.

---

## Decision D-041 - NFR-PERF-02 amended to the measured time to first token

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Chat surface (P1 Stage 7) |
| Status | accepted |
| Supersedes | amends NFR-PERF-02 |

### Context

NFR-PERF-02 set time to first token under 800ms, written before any code existed. Measured on the finished Stage 6 path, unthrottled, it is 1632ms to 1713ms. Roughly 300ms is retrieval plus reranking; the rest is the Azure round trip.

FR-32's structured payload makes it worse, because the model emits JSON and the first useful token arrives only after the opening of the `claims` array.

### Options considered

1. Stream rendered prose and validate afterwards, giving up FR-32's guarantee during the stream.
2. Amend the budget to the measured number with the reasoning recorded.
3. Leave the requirement and let the criterion fail.

### Decision

Option 2. NFR-PERF-02 becomes: **time to first token under 2000ms unthrottled, measured and reported; the 800ms target is retained as an aspiration for a future streaming design.** Retrieval stays at NFR-PERF-01's 300ms, which is met.

### Rationale

800ms was a guess made before a single request had been sent, and no amount of frontend work compresses a hosted model round trip into it. Option 1 trades a measurable safety property, per-claim citation, for a latency number, which is the wrong direction for this product: an uncited answer is a worse failure than a slow one.

### Consequences

- The published budget now reflects something measured rather than hoped for.
- Streaming rendered claims as each one validates would recover much of the gap, and is the obvious P2 improvement.
- Stage 10's throttled measurement will be worse again, and must be reported rather than renegotiated a second time.
- NFR-PERF-03 and NFR-PERF-04, the two voice budgets, remain unmeasured because Stage 2 was skipped. They are now the only performance numbers in the SRS with no evidence behind them.

---

## Decision D-042 - The 18px floor applies to the reading surface, not the whole interface

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Chat surface (P1 Stage 7) |
| Status | accepted |
| Supersedes | narrows the Stage 7 decision to lift the entire scale |

### Context

Stage 7 resolved the mock's type-scale conflict by lifting every text token to 18px, on the reading that NFR-A11Y-03's "body text is at least 18px" covered the whole interface. In use that flattened the hierarchy: navigation, context lines, captions and the answer itself all sat at one size, so nothing led.

The user narrowed the rule: 18px for the chat question and answer, everything else back to the `design/DESIGN.md` scale.

### Options considered

1. Keep every token at 18px. Meets the strictest reading; no typographic hierarchy.
2. 18px for the reading surface, DESIGN.md scale for interface chrome.
3. Return the whole scale to the mock, including the 11px citation chip.

### Decision

Option 2. `--text-message` is 18px at 1.6 line height and carries the member's question, the assistant's answer, the pending line and the starter questions. Interface chrome returns to DESIGN.md: 14px body, 23px and 40px headings, 10px caption. Two values sit outside both tiers on purpose: the composer input at 18px, because below 16px iOS zooms the page when the field takes focus, and the citation at 14px.

### Rationale

WCAG sets no absolute minimum font size, so "body text" is the project's own term and reasonably means the text a member reads rather than every label in the frame. The gap between 18px content and 14px chrome is what makes the answer dominant, which is the correct hierarchy: the answer is the product.

### Consequences

- **Interface chrome is now below 18px**, which a strict reading of NFR-A11Y-03 would have disallowed. The requirement is now understood as covering the reading surface.
- The citation stays at 14px rather than the mock's 11px chip. `docs/build-journal.md` singled that chip out as the product's trust surface set in the smallest type on the screen for an audience with declining eyesight; 11px would reintroduce a defect already identified. Reversible if the user wants the mock's value.
- The static audit changed from "no font size below 18px" to checking the split holds. That is a deliberately weaker guard, and it is weaker in a way the browser tooling deferred by D-040 would have caught properly.
- Answer text gained a 68ch measure, so line length stays readable now that the panel is no longer uniformly large.

---

## Decision D-043 - Bucket C is decided by deterministic rules, before retrieval

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Guardrails and escalation (P1 Stage 8) |
| Status | accepted |
| Supersedes | - |

### Context

FR-21 routes ten named triggers to a human. Two measurements constrained how. Stage 5 found bucket C questions score near zero on the reranker, so retrieval confidence cannot separate them from nonsense. Stage 6 found the model's own refusal branch fires inconsistently at temperature zero. Neither signal can carry a regulatory boundary.

`claude/design-decisions.md` comment T-3 had already warned that a router with an unspecified selection rule is "the part most likely to fail silently".

### Options considered

1. Rules per trigger, run before retrieval.
2. A model classifier before retrieval.
3. A hybrid: rules for the unambiguous, model for the rest.

### Decision

Option 1. Ordered rules, each with an optional exception pattern for the answerable driver beside it, evaluated before retrieval. A guarded question never reaches the model. Emergencies are checked first and are their own outcome kind rather than a refusal.

### Rationale

A guardrail that is non-deterministic is not a guardrail. The same question must refuse on every run, and every refusal must be explainable by pointing at the rule that fired. Every trigger already has a written definition in `docs/call-drivers.md` section 6, so the rules encode an existing specification rather than inventing one. Running before retrieval also means a guarded question cannot leak a partial answer on its way to being refused.

### Consequences

- **Over-refusal is the failure mode, and it is measurable.** The first live run refused two legitimate questions: "if I end up in the emergency room what am I looking at paying" matched the bare word "emergency", and "how long do I have to file an appeal" matched filing without matching the exception. Both are now regression tests. Bucket A accuracy moved 25/30 to 27/30 once fixed.
- Phrasing outside a pattern passes through. The confidence floor and the structured payload remain behind it as second and third nets.
- The rules read the golden set's bucket C cases in test, so the eval harness and the product share one definition of what must refuse.
- Emergencies take precedence over the clinical rule. "Chest pain and shortness of breath, what medication should I take" is labelled C-02 in the golden set but fires C-06, because acute symptoms need care guidance before any other boundary applies. It refuses either way, so the eval passes, but the behaviour differs from the label.

---

## Decision D-044 - The callback request collects no contact details

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Guardrails and escalation (P1 Stage 8) |
| Status | accepted |
| Supersedes | - |

### Context

FR-22 requires a refusal to present a callback request pre-filled with the question, the plan context and the documents already searched. The mock's panel also carries a "Call me back" affordance, which implies collecting a number.

NFR-SEC-01 states the system holds no protected health information and no member identity. A phone number is member identity.

### Options considered

1. Collect a phone number, so a callback is actually possible.
2. Collect nothing beyond what FR-22 names, plus an optional free-text note.
3. Drop the form and show only the phone number.

### Decision

Option 2. The form stores the question, plan context, documents searched, the refusal trigger and an optional note. No name, phone or email. Both stored text fields are redacted through FR-31 on the way in.

### Rationale

FR-22 lists what the form is pre-filled with, and a contact field is not among them. Adding one would collect exactly the identity NFR-SEC-01 promises not to hold, on a public unaffiliated deployment, for a case study that cannot protect it.

### Consequences

- **A callback request with nothing to call back.** The flow is demonstrable end to end, per D-026, but the contact leg is deliberately absent. In a deployment behind authentication the number already exists on the member record.
- The stored row is useful for corpus expansion, which is the same reason FR-31 keeps the redacted question rather than dropping it.
- If the demo needs to show a real callback loop, this decision has to be revisited alongside NFR-SEC-01 rather than quietly amended.

---

## Decision D-045 - No live partial transcript; the editable transcript carries FR-18

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Voice (P1 Stage 9) |
| Status | accepted |
| Supersedes | amends FR-18 |

### Context

FR-18 requires speech to be transcribed in real time with the partial transcript shown as the member speaks, and the completed transcript to be editable before sending.

Both chosen providers expose batch transcription only, verified against their live specs on 2026-09-08: ElevenLabs `/v1/speech-to-text` and Fish Audio `/v1/asr` each take a finished recording. ElevenLabs Scribe v2 Realtime exists as a separate WebSocket product and is not in the REST specification.

### Options considered

1. Scribe v2 Realtime over WebSocket. Meets FR-18 as written; a separate client, auth path and shapes that cannot be verified from the specification read here.
2. The browser's `SpeechRecognition` for the live partials, with the authoritative transcript from ElevenLabs.
3. No live partials. A listening state with a level meter while recording, then the transcript, editable before sending.

### Decision

Option 3. FR-18's first sentence is amended: speech is transcribed after the member finishes speaking rather than during. The second sentence stands unchanged, and the transcript remains editable before it is sent.

### Rationale

Option 2 streams a member's spoken health question to Google's servers to obtain reassurance while they talk. That is the same objection D-034 raised about a free tier training on inputs, for a cosmetic benefit rather than a functional one, and it would contradict the reason the browser tier was already excluded from the speech-to-text chain.

The protective half of FR-18 is the editable transcript: it is what stops a mis-heard question being answered as though it were correct. The live partial is reassurance that the microphone is working, which a listening state and a level meter also provide, without routing audio anywhere.

Option 1 remains the correct implementation of FR-18 as written and is worth doing once the loop is proven end to end. It was not worth doing first, against an unverified shape, in a stage whose latency budgets are themselves unmeasured.

### Consequences

- **The member waits for the transcript rather than watching it appear.** On a slow connection that wait is unexplained unless the processing state is clear, so the microphone control carries an explicit processing state.
- FR-18's acceptance criterion "partial transcript renders while speech is in progress" cannot pass and is recorded as amended rather than failed.
- No audio reaches any party other than ElevenLabs or Fish Audio.
- Moving to Scribe v2 Realtime later changes the capture path only; the editable transcript, the provider chain and the cache are unaffected.

---

## Decision D-046 - Voice latency budgets replaced with measured values

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Voice (P1 Stage 9) |
| Status | accepted |
| Supersedes | amends NFR-PERF-03 and NFR-PERF-04 |

### Context

NFR-PERF-03 set time to first audio under 1.5 seconds and NFR-PERF-04 set a complete spoken answer under 4 seconds. Both were written before any code existed, and Stage 2, the spike that was meant to measure them, was skipped. Stage 9 is therefore the first time either number has been observed.

Measured on the finished path, unthrottled and uncached, across three typical benefits questions:

| | Median | Worst |
| --- | --- | --- |
| Answer ready | 2839ms | - |
| First audio | 4007ms | 4140ms |

Synthesis itself is fast and scales with length: 245ms for a 36-character sentence, roughly 3 seconds for a 550-character answer. The dominant cost is the answer, not the voice.

### The second budget was not merely missed

NFR-PERF-04 asks for a complete spoken answer within 4 seconds. Measured speech runs at roughly 18 characters per second, so the three answers tested take 17, 22 and 31 seconds to say. A 4-second complete spoken answer is only possible for an answer of about 70 characters.

That is not a performance failure. The requirement conflated time to begin speaking with time to finish speaking, and no engineering makes speech faster than speech.

### Options considered

1. Keep both numbers and record them as failed.
2. Amend both to measured values, and split NFR-PERF-04 into the thing that can be budgeted and the thing that cannot.
3. Shorten answers until they fit four seconds.

### Decision

Option 2. NFR-PERF-03 becomes time to first audio under 4.5 seconds unthrottled, measured and reported. NFR-PERF-04 becomes: the spoken answer begins within the NFR-PERF-03 budget and plays for as long as the answer takes to say; the measured rate is roughly 18 characters per second and is reported per run.

### Rationale

Option 3 would trade the answer contract for a stopwatch. FR-05 binds per claim and the whole product rests on saying where each fact came from, so truncating answers to hit a number invented before anything ran is the wrong direction.

Amending with evidence attached is the same treatment D-041 gave NFR-PERF-02, and for the same reason: a budget nobody measured is a guess wearing a number.

### Consequences

- **Voice is slower than the original spec imagined**, and the honest figure is roughly 4 seconds before the member hears anything. The cache removes this entirely for a repeated answer, which is what makes the starter questions feel immediate.
- The dominant cost is the answer, not the voice: 2839ms of the 4007ms is retrieval and generation. Speeding voice up means speeding the answer up.
- Skipping Stage 2 cost exactly what the plan said it would. These numbers would have been available at hour 6 for the price of a throwaway page; they arrived at Stage 9 with a voice loop already built on top of them. Nothing had to be rebuilt, which was luck rather than judgement.
- Both budgets remain unmeasured under the NFR-PERF-05 throttled profile, which Stage 10 owns.

---

## Decision D-047 - Zero real PHI, ever; synthetic member records permitted from v1.1

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 scope |
| Status | accepted |
| Supersedes | amends D-001 for v1.1 onward |

### Context

D-001 and `CLAUDE.md` rule 3 state "Zero PHI in v1. No member auth, no claims, no prior-auth status." P2 stages 5 through 8 build exactly those things over five synthetic member records. The rule as written forbids the plan the user has chosen to execute, so either the rule or the plan is wrong.

The rule's real purpose was never to forbid authentication. It was to keep the project out of HIPAA scope, which is a statement about whose data is in the system, not about whether a login exists.

### Options considered

1. Amend the rule to "zero real PHI, ever" - synthetic records allowed, real member data never, at any version.
2. Keep the rule and log a scoped override for stages 5 through 8.
3. Keep the rule and drop stages 5 through 8 from v1.1.

### Decision

Option 1. `CLAUDE.md` rule 3 and `claude/context.md` section 3 are amended to forbid real PHI at every version rather than forbidding member identity in v1. Authentication and member-scoped answering are permitted from v1.1, over synthetic records only.

### Rationale

Option 2 leaves the working contract contradicting the build, which is the drift the contract exists to prevent. A rule every future cycle has to remember to override is a rule that will eventually not be overridden.

The constraint that actually matters is unchanged and now stated for every version, not just v1: no real member data enters this system. That binds harder than the original, because the original expired at v1.

### Consequences

- Stages 5 through 8 are permitted. Synthetic records must be labelled synthetic in schema, seed and output, per P2-15.
- Row-level security and audit logging remain P3. Until then, member scoping is application-layer only, and a code-path bug is not caught by the database. This is the residual risk `claude/plan-p2.md` already names.
- D-001's v1 scope decision stands as history. It is amended, not reversed: the product still shipped v1 with no identity.

---

## Decision D-048 - The second indexed contract is H8010-002 Classic (HMO)

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 1 |
| Status | accepted |
| Supersedes | - |

### Context

`claude/plan-p2.md` Stage 1 requires a second benefit package under a distinct contract identifier, and offers "the HMO contract or a second PPO service area". The Hudson County catalog carries six plans across two contracts: H5141 004, 007, 054 and 061, all PPO, and H8010 002 Classic and 003 Value, both HMO.

v1 already indexes H5141-004 and 007. Both sit on one contract and share one Summary of Benefits PDF, extracted per plan column.

### Options considered

1. H8010-002 Classic, one HMO plan on a distinct contract, same county.
2. H8010-002 and 003, both HMO plans.
3. H5141-054 Choice Giveback, a third PPO on the existing contract.
4. H5141 in a second county or state.

### Decision

Option 1. H8010-002 Classic is indexed as a third plan under a second contract.

### Rationale

Option 3 fails the acceptance criterion outright: same contract id. Option 4 tests geography rather than benefit design and needs the county constants generalized first, which is P4's eleven-state work arriving early.

HMO against PPO differs on more than price. Referral requirements and out-of-network coverage differ structurally, so paired cross-plan questions produce different answers of different shapes rather than two numbers. That is the stronger demonstration that plan scoping is load-bearing.

Option 2 was rejected for cost, not correctness: a second HMO plan adds ingest surface and answers no question the first one does not.

### Consequences

- The corpus scope constants in `src/corpus/cli.ts` stop being a single contract with a plan list.
- H8010's Summary of Benefits layout is unverified. `pdfToPlanColumn` handles the H5141 side-by-side two-column PDF; whether the HMO SB has the same shape is unknown until fetched, and is a Stage 1 risk.
- Adding H8010-003 later is a one-line scope change, not a rebuild.

---

## Decision D-049 - Plan identity is a contract-and-plan pair throughout

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 1 |
| Status | accepted |
| Supersedes | - |

### Context

v1 assumes one contract everywhere. `CONTRACT_ID` is a single environment variable in `src/server.ts`, `PLANS` is a list of bare plan ids, the retrieval scope passes `{ contractId, planId, planYear }` with the contract constant, the turn log writes `planContext` as a formatted string, and the web chips carry ids alone. D-048 introduces a second contract, which breaks that assumption at every one of those points.

### Options considered

1. Make plan identity an explicit contract-and-plan pair threaded through server, retrieval, turn log, golden set and web.
2. Keep `planId` as the key and encode the contract into the string, as "H8010-002".
3. Add a second contract environment variable.

### Decision

Option 1. One plan-reference shape carries contract and plan together, and every layer that scopes by plan takes it.

### Rationale

Option 2 turns the contract into an unvalidated substring. Cross-plan leakage is the failure this stage exists to prevent, and it produces a confidently wrong copay rather than an error; a leak that hides in string parsing is precisely the one no test catches. Stage 1's negative leakage assertion only means something if the thing being asserted on is typed.

Option 3 is configuration for a case that is already known to grow: P4 expands to eleven states. A second variable would be removed by the next stage that touched it.

### Consequences

- Larger Stage 1 diff than the stage's "M" band assumed, touching files the stage description does not list.
- The 49 golden cases keyed to plan "004" need their contract stated rather than implied.
- P4's multi-state expansion inherits the right shape instead of paying to unwind the wrong one.

---

## Decision D-050 - P2 gets its own requirements document, srs-p2.md

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 requirements |
| Status | accepted |
| Supersedes | - |

### Context

`claude/srs.md` v1.1.0 is frozen and covers P1. `claude/plan-p2.md` states in its own header that it has no frozen SRS behind it, and that the authenticated tier needs a requirements pass before Stage 5. `CLAUDE.md` rule 1 forbids production code without a spec entry. `/spec-feature` is explicitly forbidden from editing `srs.md`.

### Options considered

1. Write requirements per stage into `claude/features.md` inside each feature cycle.
2. Run a full requirements pass before Stage 5 only, covering the auth tier.
3. Run a full requirements pass now, covering all eight stages, into a new `claude/srs-p2.md`.

### Decision

Option 3. `claude/srs-p2.md` is written before Stage 1 begins and covers all eight P2 stages. `claude/srs.md` stays frozen at v1.1.0 as the P1 record.

### Rationale

The user's call. A single document covering the whole of P2 keeps the public-tier stages specified to the same standard as the authenticated ones, rather than treating stages 1 through 4 as self-evident because `docs/ideas.md` mentions them.

Keeping P1's SRS frozen preserves it as the artefact v1.0.0 was actually built against, which is what makes the v1 record auditable.

### Consequences

- Stage 1 is delayed by a full requirements pass.
- Two requirement documents exist, and requirement ids must not collide. P2 requirements are numbered in their own space.
- `claude/srs.md` section 8's "deferred to v1.1, specified separately" now points at a document that exists.

---

## Decision D-051 - Structured lookup ships for the formulary only; provider search keeps refusing

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 2 |
| Status | accepted |
| Supersedes | narrows D-007 |

### Context

D-007 decided that provider search and formulary tier lookup both hit typed queries. `claude/plan-p2.md` Stage 2 carries that forward. But the provider directory in this corpus is not real: Clover publishes no downloadable directory, so `src/corpus/synthetic.ts` invents ten rows, and v1 answers provider questions by stating the directory is demo data and routing to a human.

### Options considered

1. Formulary only. Provider search keeps the v1 refuse-and-route behaviour.
2. Both paths, with the demo-data label carried into every provider answer.
3. Both, plus reversing D-036 to ingest the pharmacy directory as typed rows.

### Decision

Option 1. The formulary is ingested into typed rows and gets a typed tier lookup. Provider search is not built. The router is still built and still tested, selecting between one structured path and RAG.

### Rationale

Building exact structured search over invented data produces a confident, precise, wrong answer about whether a member's doctor is in network. That is the exact failure mode the whole product is built to avoid, and no label fully undoes a precise answer.

The router, which `claude/plan-p2.md` calls the highest-uncertainty item in P2, is unaffected. It is exercised by the formulary path against RAG regardless.

### Consequences

- D-007's provider-search half is deferred with a reason, not delivered.
- "Is my doctor in network" remains unanswerable and continues to route to a human.
- Stage 2's routing test set covers formulary-versus-RAG selection. Provider questions belong to the guardrail path, not the router.
- D-036's pharmacy exclusion stands unchanged.

---

## Decision D-052 - Email OTP delivery uses Resend on the free tier

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 6 |
| Status | accepted |
| Supersedes | - |

### Context

Stage 6 needs a six-digit code delivered to a seeded member's email address. `CLAUDE.md` rule 7 requires a defensible reason for any new dependency and rule "zero cost" requires free tier, open source or local.

### Options considered

1. Resend on the free tier: 3,000 emails a month, 100 a day.
2. Print the code to the server log and surface it in a development-only panel, adding no dependency.

### Decision

Option 1. Resend, free tier, with the API key in an environment variable.

### Rationale

The user's call. A login whose code never leaves the server is not a login flow a reviewer can complete, and Stage 6's exit signal is receiving a code by email and pasting it into the panel.

### Consequences

- One new dependency and one new secret. The secret scan in `tests/unit/no-secrets.test.ts` already covers the key shape.
- A sending domain must be verified with Resend, or delivery is limited to the account owner's own address.
- Codes must never appear in any log, which Stage 6's test plan already asserts.

---

## Decision D-053 - Corpus scope is one typed module, not four sources of truth

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 1 |
| Status | accepted |
| Supersedes | - |

### Context

FR-P2-01 requires corpus scope to be data rather than hardcoded constants. Investigating what that means found scope defined in four places by two different mechanisms: module constants in `src/corpus/cli.ts`, and `CORPUS_CONTRACT_ID` / `CORPUS_PLAN_IDS` / `CORPUS_PLAN_YEAR` read independently by `src/rag/cli.ts`, `src/server.ts` and `eval/harness/run.ts`. `scripts/deploy-api.sh` also forwards `CORPUS_COUNTY_ID` to Cloud Run, which no code reads.

### Options considered

1. One typed `src/corpus/scope.ts` holding a plan-reference array plus county and year, imported by all four call sites.
2. A committed `corpus/scope.json` with a hand-rolled validator.
3. CLI flags on `discover`, `fetch` and `convert`.

### Decision

Option 1. Scope lives in one typechecked module. The three `CORPUS_*` environment variables and the dead `CORPUS_COUNTY_ID` are deleted.

### Rationale

The defect FR-P2-01 points at is four sources of truth, not the file extension. Only option 1 collapses all four.

Option 3 is actively unsafe: `fetch` and `convert` read the manifest `discover` wrote, so a run with mismatched flags produces a snapshot whose contents disagree with its declared scope, and nothing detects it.

Option 2 adds a trust boundary and roughly thirty lines of validator - this project has no `zod`, so validation is hand-rolled - to protect a file only the author edits, and the file itself is not typechecked.

### Consequences

- Adding H8010-003 or a fourth plan is appending one record, which is what D-048's consequence promised.
- `Snapshot.contractId` and `Snapshot.planId` become a plan-reference list, and `src/corpus/report.ts` renders the list.
- P4's eleven-state expansion turns one county record into an array and a `flatMap` in `discover`. Deliberately not built now.
- A reader taking "scope is data" to require a non-code artefact would not accept this. Recorded as the known objection.

---

## Decision D-054 - PlanRef types the scope, not every row that reports a plan

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 1 |
| Status | accepted |
| Supersedes | narrows D-049 |

### Context

D-049 makes plan identity a typed contract-and-plan pair throughout. `contractId:` appears 59 times across 35 files, including 13 test files and 8 one-off scripts. Taken literally, D-049 rewrites all of them.

`searchHybrid` and `answerTurn` already take an anonymous `{ contractId, planId, planYear }`, so the scoping type largely exists and is unnamed.

### Options considered

1. `PlanRef` names the scoping shape only. Rows keep flat fields.
2. As above, plus three structured columns on `turns` and `callbacks`.
3. `PlanRef` nested into `Provenance`, `RetrievedChunk`, `CorpusChunk` and `ManifestEntry` as well.

### Decision

Option 1. `PlanRef` lives in `src/types.ts` and types what a caller scopes *with*. A row keeps flat fields describing what it *is*. `planContext` stays a text column, written by a single formatter from the answering reference.

### Rationale

The failure D-049 exists to prevent is leakage from a scope, and a scope is the one plan value that originates outside the system. A chunk's contract comes from the column it was selected by and cannot disagree with the scope that selected it, so nesting the pair into row projections defends against a bug that cannot occur.

The real turn-log defect is not the column type. `src/server.ts` composes `planContext` from a module constant, so a turn answered under H8010-002 would have been logged as `H5141-002`. Writing it from the answering reference fixes that completely and needs no migration.

Option 2's structured columns leave every pre-migration row null forever, or require a backfill that string-splits `plan_context` - the parsing D-049 exists to forbid.

Option 3 rewrites citation rendering, which Stage 3 also touches.

### Consequences

- The line is: `PlanRef` is what you scope with; flat fields are what a row reports about itself.
- No migration on `turns` or `callbacks`. `npm run reproduce` and `npm run insights` are unchanged.
- Filtering the turn log by contract alone is not possible. No P2 requirement asks for it.
- `/api/ask` gains membership validation against the derived plan list, returning 400 on an unknown reference rather than today's silent zero-result refusal.

---

## Decision D-055 - The offerable plan list is derived from the index; display names stay in code

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 1 |
| Status | accepted |
| Supersedes | - |

### Context

`PLANS` in `src/server.ts` is a hardcoded two-entry list served to the web chips, and it can silently disagree with what is indexed. Display names such as "Clover Health Choice (PPO)" exist nowhere in the `chunks` table.

Reading `data/snapshots/<id>/catalog.json` at boot is already falsified: `data/` is gitignored and the Dockerfile copies only `src` and `certs`. The 2026-09-08 production incident was this exact class of assumption.

### Options considered

1. Derive the offerable set from `chunks` at boot; display names from a typed code-level map.
2. A small `plans` table upserted at ingest, joined against `chunks`.
3. A `plan_name` column on `chunks`.
4. Read the catalog snapshot at boot.

### Decision

Option 1. `select distinct contract_id, plan_id, plan_year from chunks` runs once at startup. Names remain a typed key-to-label map, matching the existing `KIND_LABEL` pattern.

### Rationale

The safety property is the *set*: a plan must never be offerable without indexed documents. Option 1 derives exactly that part from the index and leaves in code the part that is presentation and changes once a year.

It also strengthens boot. `connect()` constructs a `pg.Client` but never dials, so it throws only on a missing `DATABASE_URL` or an unreadable CA file - a wrong password or unreachable host still boots clean today, despite the comment claiming otherwise. A real query at boot makes an unindexed or unreachable deploy fail to start rather than serve an empty plan picker.

Option 3's exclusion of wildcard rows encodes the invariant only by accident. Option 2 encodes it properly in a join and is the right answer if display names ever need to vary per deployment or plan year.

### Consequences

- Adding a plan needs two edits, the scope module and the name map, plus a restart. For this product a restart is a redeploy that was happening anyway.
- A plan reference with no name entry must fail loudly rather than render a raw id to a member.
- `web/src/components/CallbackPanel.tsx` currently shows a member the raw string "H5141-004" under a heading reading "Plan". The same name map should feed it.
- If display names later vary per deployment, this is replaced by option 2.

---

## Decision D-056 - Contract-wide documents use a contract wildcard, mirroring the plan wildcard

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 1 |
| Status | accepted |
| Supersedes | - |

### Context

`src/rag/ingest.ts` stamps `planId = '*'` for the kinds in `CONTRACT_WIDE` - formulary and corporate. But `search_hybrid` still filters `c.contract_id = p_contract_id`, and `src/corpus/cli.ts` stamps corporate pages and filer documents with the single `CONTRACT_ID`. A session scoped to H8010 would therefore lose all six corporate pages and the entire formulary.

### Options considered

1. A contract wildcard mirroring the plan wildcard, with `search_hybrid` matching `(c.contract_id = p_contract_id or c.contract_id = '*')`.
2. A wildcard for corporate only, discovering H8010's own formulary separately.
3. Duplicating the rows once per contract.
4. Substituting the session contract at query time.

### Decision

Option 1. `discover` leaves `contractId: ""` alongside the existing `planId: ""`, and ingest maps both wildcards from the one `CONTRACT_WIDE` list.

### Rationale

Symmetric with a mechanism that already exists and is already tested. One list, one place. `buildProvenance` keeps rejecting an empty id, so a blank can never reach a chunk.

The formulary file is `formulary_ch_nj` - one New Jersey formulary with a contract-agnostic filename - so option 2 would be discovering a document that does not exist. Option 3 re-embeds the same text for every future contract. Option 4 moves scoping outside the SQL that D-033 deliberately put it inside.

### Consequences

- One migration, `create or replace function search_hybrid`, with unchanged parameters and return columns.
- `citationLabel` needs a contract-wildcard branch or it renders "Plan \*" to a member.
- `contextPrefix` embeds `contractId-planId` in the stored body, so changing these to the wildcard makes `existingChunkContent` see every formulary and corporate chunk as changed. They re-embed once. Roughly 500 chunks, one time.

---

## Decision D-057 - The column-gutter bug is fixed as a bug cycle nested inside Stage 1

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 1 |
| Status | accepted |
| Supersedes | - |

### Context

`extractPlanColumn` computes a `PlanColumns` struct per page and `nearestColumns` hands that whole struct - including absolute `boundary` and `labelBoundary` x coordinates - to pages carrying no `(Plan NNN)` header.

H8010's Summary of Benefits has a two-column benefits table on page 11 with no header row, and the document alternates recto and verso margins. Measured: page 11's own correct gutter is 354.52, page 9's is 338.02, page 10's is 359.58. Inheriting either cuts a word in half and the existing safety throws "amounts on both sides of the column boundary and a word crossing it". H5141 never triggers this because every one of its table pages carries a header.

The gutter is not a rigid translation of the margin. The recto/verso margin difference is about 41.5pt and the header spacing 18pt, while the gutters differ by 21.56pt, so any fix that shifts an inherited boundary by a margin delta is wrong by construction.

### Options considered

1. Split the struct: inherit plan identity and header x positions only, compute both gutters from the page being rendered.
2. Fully page-local gutter detection from an x-histogram, inheriting only which plan is on which side.
3. Stop inheriting and require every two-column page to carry a header.

### Decision

Option 1, prototyped and verified against both documents before this decision was taken. All four plans extract; H5141-004 still yields $10 and 007 still $2, matching the values hand-verified in P1 Stage 1.

`nearestColumns` is additionally restricted to a backward-only search, so a page appearing before its document's first header page fails loudly rather than being attributed from a header it precedes.

Sequenced as a `/spec-bug` cycle nested inside Stage 1: fetch far enough to save the page-10 and page-11 fixture, run the bug cycle against that artefact, then resume the stage.

### Rationale

The measured spread proves the gutter is content-derived per page, so option 1 recomputes exactly and only the quantity that is per-page, while leaving inherited the two things that genuinely are document-level.

Option 2 solves a problem the evidence does not show exists and pays for it with a new silent failure: `findGutter` always returns something, so a full-width prose page with a coincidental gap would be cut without any error. A loud failure is better than a quiet wrong one.

Option 3 breaks the existing H5141 page-15 test and fails H8010 page 11 outright, so neither document converts.

The nesting satisfies `/spec-bug`'s "no repro, no fix" with a real artefact rather than a synthesised one, and keeps the fix diff separately reviewable inside a larger stage.

### Consequences

- This is a latent v1 defect. No document currently in the corpus triggers it, and it would have surfaced on any future document whose table pages do not all carry headers.
- The residual: inherited header x positions still bound `findGutter`'s search window. A page whose columns sit outside that window falls back to the window midpoint. At 18pt of drift against a window roughly 200pt wide this is unlikely, and the existing money-on-both-sides throw catches it loudly.
- Backward-only search means a pre-header two-column money table now throws instead of being silently attributed. Nothing currently converting is affected.
- **Conflict flagged, not resolved:** `CLAUDE.md` section 3 says a bug logs under `### Fixed`, and section 8 says the changelog carries user-facing changes only. This fix is invisible to members. Taken as: not in `CHANGELOG.md`, recorded in `claude/context.md`. Reversible on the user's word.

---

## Decision D-058 - The formulary is parsed from bounding boxes, not from layout text

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 2 |
| Status | accepted |
| Supersedes | - |

### Context

`srs-p2.md` listed as an open question whether the formulary's tier column survives `pdftotext` extraction cleanly enough for typed ingest. Measured before deciding: the layout text yields all 2,468 drug rows, but wrapped lines carry real data - 564 strength continuations and 379 requirement continuations - and column offsets differ across pages, with three distinct header positions.

One line carries both halves at once:

```
     37.5mcg/hr, 50mcg/hr, 62.5mcg/hr,                            days), PA
```

Dropping continuations loses step-therapy and prior-authorization flags, so a drug would read as carrying a quantity limit only when it also requires step therapy.

### Options considered

1. `pdftotext -bbox-layout`, reusing `parseBboxPages` from the Summary of Benefits path.
2. Layout text with per-page column detection inferred from the repeated header.
3. Layout text, joining continuations by an indentation threshold.

### Decision

Option 1. Column boundaries come from the `Drug Name / Drug Tier / Requirements/Limits` header's own word positions, measured on each page.

### Rationale

With real coordinates a continuation line's column is a fact rather than an inference, and the both-halves line resolves without a special case. Option 3's single indent threshold mis-assigns exactly that line.

D-057 had just established that absolute column assumptions break across pages in this filer's documents. Choosing option 2 or 3 would have repeated the mistake in a second parser.

Measured on the real document: 85 of 123 pages carry the table header, columns are stable at Tier x=375 and Requirements x=410, and the parse yields 2,468 rows across 105 categories with none orphaned. Pages 95 to 123 are the alphabetical index and carry no header, so they are skipped by the same signal.

### Consequences

- A second consumer of `parseBboxPages`, which was written for one document and is now shared.
- The formulary needs a bbox conversion alongside its existing text conversion.
- Category headers are identified by x position rather than by letter case, which is what D-059 exists to fix.

---

## Decision D-059 - Formulary class headings are identified by position, not by letter case

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 2 |
| Status | accepted |
| Supersedes | - |

### Context

`FORMULARY_CLASS` in `src/rag/chunk.ts` is `/^(\s*)([A-Z][A-Z0-9 &,'/-]{5,})\s*$/`. The character class admits no lowercase letter and no parentheses, so two real drug-class headings never match:

- `ANTILIPEMICS, HMG-CoA REDUCTASE INHIBITORS` - lowercase `o` in `HMG-CoA`
- `DISEASE-MODIFYING ANTI-RHEUMATIC DRUGS (DMARDS)` - parentheses

A missed heading does not produce an error. The drugs beneath it inherit the previous class, so ten statins are indexed and cited under `ANTILIPEMICS, FIBRATES`. This is live in v1.0.0 and visible in `eval/results/2026-09-08T0947Z.json`, where atorvastatin is cited to `...formulary-cardiovascular-antilipemics-fibrates-001`.

Statins are among the highest-volume drug classes for a 65+ population, so this is not an obscure corner.

### Options considered

1. Fix inside Stage 2 as a nested bug cycle, the shape D-057 used.
2. Fix now as a standalone `/spec-bug` before Stage 2 begins.
3. Leave it, and let the typed rows become the source of truth for drug questions.

### Decision

Option 1. Class headings are detected by their x position - they sit left of the drug-name column - rather than by asserting every character is uppercase.

### Rationale

Option 3 leaves the two paths disagreeing about the same drug. The formulary stays in RAG for its prose, so a member asking a class question would still receive the wrong section while the typed path returned the right one, which is worse than either being wrong alone.

Option 2 pays for two re-ingests, since Stage 2 re-ingests anyway when the drugs table lands.

Letter case was never the signal. Position is, and the typed parser needs the same correction, so one rule serves both paths.

### Consequences

- Affected chunks change their context prefix and re-embed. Ten drugs, one class.
- A regression test pins both headings by name, so a future character-class edit cannot silently drop them again.
- Invisible to members as a category label, but the citation they read changes, so it is recorded in `CHANGELOG.md` under Fixed rather than omitted as internal.

---

## Decision D-060 - Typed drug rows live in their own table, populated at ingest

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 2 |
| Status | accepted |
| Supersedes | - |

### Context

D-007 requires typed queries for facts that live in tables. The parsed formulary is 2,468 rows across 105 categories, and it has to be queryable at answer time.

### Options considered

1. A `drugs` table populated by the existing ingest command.
2. A JSON artefact written to the snapshot directory at convert time.
3. Extra structured columns on the existing `chunks` table.

### Decision

Option 1. One migration, one table, populated in the same `npm run ingest` run that writes chunks.

### Rationale

Option 2 reads from `data/`, which is gitignored and absent from the container. That is precisely the assumption behind the 2026-09-08 production incident and the one D-055 was written to avoid.

Option 3 overloads a table whose shape exists for embedding and retrieval with one that exists for exact lookup, and `chunks` is already carrying wildcard scoping semantics from D-056.

### Consequences

- A second migration in this stage, on top of the router's logging columns.
- Tier is one column for all seven New Jersey plans the formulary names, so drug rows are contract-wide in the same sense as their chunks, and a tier answer does not vary by plan.

---

## Decision D-061 - The router is deterministic, driven by the drug names actually indexed

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 2 |
| Status | accepted |
| Supersedes | - |

### Context

`NFR-P2-03` makes misrouting a drug-tier question to prose search a zero-tolerance failure, and `claude/plan-p2.md` calls the router the highest-uncertainty item in P2. Comment T-3 records that D-007 is strong on the split and silent on the selection rule.

### Options considered

1. Deterministic: the structured path runs when the question names a drug the typed table holds.
2. An LLM classifier with a routing prompt.
3. Rules first, model as fallback.

### Decision

Option 1. Route selection is a lookup against the indexed drug names.

### Rationale

A zero-tolerance gate whose decision comes from a probabilistic component is not zero-tolerance. Option 1 makes tier-to-RAG misrouting impossible for any drug in the table, by construction rather than by measurement.

This follows D-043, which put bucket C on deterministic rules evaluated before retrieval for the same reason: a guarded question must never depend on the model to be guarded.

The cost is that a drug the table does not hold cannot trigger the structured path. That is correct behaviour - there is no row to cite - and it falls through to RAG, which is where an unknown drug belongs.

### Consequences

- The router cannot handle a misspelled drug name. This audience will misspell drug names, and the fallback is RAG rather than a failure, so the cost is a worse answer rather than a wrong one.
- The confusion matrix measures a rule, so a non-perfect score is a gap in the name index rather than a model that needs prompting.

---

## Decision D-062 - Retrieval paths are additive, not exclusive

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 2 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-10` requires that "is this drug covered and what is the appeal process" answers both halves and drops neither. A router that selects one path has to decide which half to serve.

### Options considered

1. The router returns a set of paths; both results feed one prompt, each with its own citation.
2. The router selects one path, and the structured path chains to RAG when its answer looks incomplete.
3. Always run both and merge, with no routing decision at all.

### Decision

Option 1. A drug name adds the structured path; RAG runs unless the question is a pure lookup.

### Rationale

Dropping a half becomes structurally impossible rather than something a heuristic has to get right. Option 2's "looks incomplete" test is a new judgement call in the middle of an answer path that currently has none.

Option 3 cannot be measured. The plan requires a router that logs a selection and a 30-case accuracy figure, and a router that always chooses everything has no selection to report.

### Consequences

- A pure tier question costs one extra retrieval unless it is recognised as pure, so "pure lookup" needs a definition and a test.
- Both citation kinds can appear in one answer, which is the shape `FR-P2-29` will need for combined member answers in Stage 7.

---

## Decision D-063 - Router decisions are columns on the turn log, and routing has its own test set

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 2 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-09` requires the router to log its selection and reason on every turn, and Stage 8 has to report router accuracy in the same output as the answer metrics.

### Options considered

For storage: dedicated columns on `turns`; folding the decision into the existing `latency_ms` JSON blob; stdout only.
For the test set: its own file run inside `npm run eval`; extra fields on the existing golden set; its own file and its own command.

### Decision

Two nullable text columns on `turns`, `route` and `route_reason`. A separate `eval/golden/routing-set.json` of at least 30 hand-labelled cases, evaluated inside the existing `npm run eval` run and reported in the same output.

### Rationale

The route is a categorical fact about a turn that Stage 8 must aggregate, so it is queryable rather than parsed back out of a column named for timings.

Routing is a classification problem with a confusion matrix, and the 60 answer cases were chosen to cover call drivers rather than to stress a router's boundary. Keeping the sets apart keeps each one honest; running them together satisfies `FR-P2-51` without merging two reports.

### Consequences

- `npm run insights` can group by route and show where questions actually go.
- The eval run gets longer by the routing set, which needs no model call because the router is deterministic.

---

## Decision D-064 - The headline amount is part of the answer contract

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 3 |
| Status | accepted |
| Supersedes | extends D-038 |

### Context

`FR-P2-13` requires the amount to be the visually dominant element of a cost answer. Nothing in the system knows what the amount is: the structured payload returns claim sentences such as "The specialist copay is $10", and the renderer receives prose.

### Options considered

1. Extend the payload with an optional headline the model fills, validated like every other field.
2. Extract the first currency token from the leading claim on the server.
3. Extract it in the browser.

### Decision

Option 1. `AnswerPayload` gains an optional `headline: { label, amount, citationIds }`, validated by the same hand-rolled parser that guards claims, and bound by cite-or-refuse exactly as a claim is.

### Rationale

Options 2 and 3 are a regular expression making a claim about money. "There is no $0 deductible" yields `$0`; "in-network $10, out-of-network $20" yields whichever comes first; an out-of-pocket maximum in the same sentence as a copay is indistinguishable. A wrong number rendered at 40px is the most legible possible way to be wrong, on the surface the product's trustworthiness rests on.

The model already returns typed claims each carrying citation ids, and D-038 made an uncited claim structurally impossible rather than merely detectable. A headline is one more field on that contract, and it can be left empty, which is what makes the degradation rule in D-065 possible.

### Consequences

- The prompt gains an instruction and the validator a branch. An invalid headline fails the payload rather than rendering.
- A headline without a citation is rejected, so the largest element on the screen cannot be uncited.
- The model can decline to fill it, and a question with no single amount simply has none.

---

## Decision D-065 - The card appears only when the headline is filled

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 3 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-14` requires the card to degrade to readable prose when the answer is not a single amount. Something has to decide which shape an answer takes.

### Options considered

1. Card when the payload carries a headline; today's claim rendering otherwise.
2. Card when exactly one claim contains exactly one amount.
3. Card for cost-driver questions, decided from the question.

### Decision

Option 1. One rule, one source: the headline's presence.

### Rationale

Option 2 silently drops the card for "$10 in-network, $20 out-of-network", which is precisely the answer a member most wants a number from. Option 3 decides before the answer exists and fires the card on questions that turn out to have no amount.

Degradation is then not a second layout but the absence of a first: a headline-less payload renders exactly as it does today, so the prose path is the one already tested by every existing case.

### Consequences

- Card coverage depends on the model filling the field, so the eval measures it rather than assuming it.
- No client-side inference about answer shape.

---

## Decision D-066 - Two corpus dates, stored where the server can reach them

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 3 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-16` requires the corpus ingestion date to be visible from the interface. Two dates exist and mean different things: when Clover's documents were fetched, recorded in the snapshot manifest, and when they were indexed, recorded in `chunks.created_at`.

The manifest lives under `data/`, which is gitignored and absent from the container. Reading it at query time is the assumption behind the 2026-09-08 production incident.

### Options considered

1. A `corpus_snapshots` table holding both dates, written at ingest and read at boot.
2. `min` and `max` of `chunks.created_at`.
3. An environment variable set at deploy.

### Decision

Option 1. Members see the document date; the ingest date stays in the operator tools.

### Rationale

A member asking whether an answer is current is asking about the documents, not about our pipeline. Option 2 cannot supply that date at all, and its ingest window is misleading besides: ingest is incremental, so after Stage 2 re-embedded 675 of 1,913 chunks the maximum reads as today while most of the corpus is older.

Option 3 is a value that can drift from the corpus it describes, with nothing to detect the drift.

Storing it follows the pattern D-060 set for drugs and D-055 set for the plan list: what the server needs at query time lives in the database, not on a disk the container does not have.

### Consequences

- A third migration in P2.
- The date is as accurate as the last ingest, which is the correct coupling.

---

## Decision D-067 - The staleness warning rides on the answer, not on the chrome

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 3 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-17` requires a plain-language warning once the wall-clock year passes the corpus plan year.

### Options considered

1. On every answer, attached to the citation block.
2. One persistent banner in the assistant header.
3. Both.

### Decision

Option 1, with this copy:

> These are your 2026 plan documents. It is now 2027, so your costs may have changed. Call to check before you rely on this.

### Rationale

A member reads one answer and may never scroll to a header. An answer that is printed, copied or read aloud carries its own warning only if the warning is part of it, and Stage 4 adds exactly those surfaces.

The copy names both years so the member can see the gap rather than trust the word "stale", and it ends with what to do. "Plan year changed" was rejected as jargon.

### Consequences

- Repetition in a long transcript, accepted deliberately.
- The warning travels into print, export and the spoken answer for free.

---

## Decision D-068 - Card layout: label, amount, sentence, source

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 3 |
| Status | accepted |
| Supersedes | - |

### Context

`claude/plan-p2.md` Stage 3 references the mock's bot message block and notes its citation chip is set at 11px, the smallest type on the screen, on the surface the product's trustworthiness rests on. D-042 already resolved that to 14px.

### Options considered

1. Label above, amount, then the sentence, then the source. Amount at `--text-heading`, 40px.
2. Amount first at `--text-heading-lg`, 56px, label beneath.
3. Sentence first with the amount pulled out into a side rail.

### Decision

Option 1.

### Rationale

The label first means the figure is never ambiguous on its own: "$10" alone does not say whether it is a copay, a deductible or a maximum, and a member glancing at a large number will read it as whichever they were worried about.

Option 3's side rail collapses under the text on a phone, where most of this audience reads, and stops being dominant exactly where the requirement matters.

40px is on the DESIGN.md scale and is dominant against an 18px reading surface without shouting.

### Consequences

- The reading surface stays 18px at a 68ch measure and the citation 14px, per D-042.
- The amount must meet AA contrast at its rendered size, asserted statically.

---

## Decision D-069 - The headline field ships dormant; the answer card is not delivered

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 3 |
| Status | accepted |
| Supersedes | amends D-064 and D-065 |

### Context

D-064 put the headline amount in the answer contract on the reasoning that the model already returns typed claims, so one more field is cheap. The field, its validation and the card were built. Filling it needs an instruction in the system prompt, and that instruction is not free.

Measured at temperature 0, against the identical corpus and index:

| | Stage 2 run | With the headline rule |
| --- | --- | --- |
| Faithfulness | 1.000 | 0.989 |
| Bucket A | 37/40 | 36/40 |
| Refusal rate | 10.0% | 7.5% |
| A-22 faithfulness | 1.0 | 0.6 |
| A-31, a pharmacy question the corpus cannot answer | refused | **answered** |

A-31 is the one that matters. D-036 excluded the pharmacy directory, so "which pharmacies near me are in network" must refuse. With the rule present it answers from the Evidence of Coverage's prose about network pharmacies instead.

Rewording the rule as display-only, explicitly stating it changes nothing about what is answered or refused, did not restore the behaviour. Removing it did, verified by isolating that single change.

The mechanism is dilution: seven standing rules became eight, and rule 4 is the refusal rule.

### Options considered

1. A second model call over the validated claims only, leaving the answering prompt untouched.
2. Ship Stage 3 without the card. The contract field, validation, card markup, freshness and staleness all land; nothing fills the headline.
3. Accept the regression and keep the rule.
4. Deterministic extraction from the claims, reversing D-064.

### Decision

Option 2. The user's call. `FR-P2-13` - the amount as the visually dominant element - is **not delivered**.

### Rationale

Option 3 trades a refusal the corpus requires for a layout improvement. A member asking which pharmacies are in network would receive an answer the product cannot support, which is the failure the whole design exists to prevent, and it breaches NFR-P2-04 besides.

Option 4 puts a regular expression in charge of which number is the headline, with the failure modes D-064 rejected it for.

Option 1 remains open and is the likely route if the card is picked up later: it cannot change answering behaviour by construction, at the cost of one extra call on cost answers.

### Consequences

- **`FR-P2-13` is not met**, recorded like D-051's provider search rather than quietly dropped. The plan's first Stage 3 acceptance criterion is marked accordingly.
- `AnswerPayload.headline` stays in the contract, validated and tested, and is always null. `parseHeadline` still rejects an uncited or unlabelled headline, so whatever fills it later is bound by cite-or-refuse.
- The card markup and CSS ship dormant. `AnswerBody` renders it when a headline is present and renders today's prose when it is not, which is D-065's degradation rule doing its job with the card side unexercised.
- Everything else in Stage 3 ships: both corpus dates, the staleness warning on every answer and in speech, and the citation completeness assertions.
- **Recorded for the next model change:** a prompt whose rule count grows can weaken the rules already there. Any future addition to `SYSTEM` should be measured against the golden set before it is kept.

---

## Decision D-070 - Contextual follow-up chips are not built

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-22` folded `docs/ideas.md` P2-01 into Stage 4: two or three contextual follow-up questions after each answer. The obvious implementation asks the answering model for them.

D-069 measured what touching that prompt costs. One added rule moved faithfulness from 1.000 to 0.989 and turned a pharmacy question the corpus cannot answer from a refusal into an answer. Even naming an unused field in the declared JSON shape moved a case from 1.0 to 0.667.

### Options considered

1. Drop follow-ups. Ship the three commands `docs/ideas.md` P2-06 actually names.
2. A second model call over the finished answer, never the answering prompt.
3. Deterministic suggestions from the cited sections' siblings.
4. Static chips keyed to the call driver.

### Decision

Option 1. Quick replies are `help`, `talk to a person` and `start over`. P2-01 returns to unbuilt.

### Rationale

The user's call, taken with the Stage 3 measurement in hand. Option 2 is safe for the answer path but produces suggestions grounded in nothing, which on a cite-or-refuse product invites a member to ask a question the corpus cannot answer. Option 3 turns section headings into stilted questions and offers siblings unrelated to what was asked. Option 4 goes stale the moment the corpus changes.

The deflection argument for P2-01 was that one session resolving three questions deflects three calls. That is real, and it is not worth a measurable drop in whether the answers are true.

### Consequences

- P2-01 is unbuilt and recorded as such rather than quietly folded away.
- `FR-P2-22` is met only in its command half. The plan's chip criterion is marked partial.
- The route if it is revisited is option 2 with the suggestions checked against the index before they are offered.

---

## Decision D-071 - Help is an inline expandable section, not a dialog

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-23` requires the help panel to be reachable by keyboard and to **not** trap focus. A modal dialog is defined by trapping focus; that is what makes it modal. The requirement is describing something that is not a dialog.

### Options considered

1. An inline expandable section in the normal document flow.
2. A non-modal floating dialog closed by Escape.
3. A separate `/help` route.

### Decision

Option 1. A disclosure button expands help in place, with `aria-expanded` and `aria-controls`.

### Rationale

Tab moves through the panel and out the other side, so nothing is trapped and Escape is unnecessary. A screen reader announces an expanded region rather than a dialog that has taken over.

Option 2 is the pattern screen-reader users most often lose their place in. Option 3 leaves the conversation, which is the thing D-022's lazy plan prompt and Stage 6's inline login both exist to avoid.

### Consequences

- Help pushes content down rather than covering it, which on a 40vw panel means scrolling. Accepted: this audience scrolls more comfortably than it recovers from a lost focus position.
- It is also the P4-06 tour's re-entry point, per P2-07, and an inline section is a stable target for that.

---

## Decision D-072 - Starting over and clearing history are different actions

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4 |
| Status | accepted |
| Supersedes | - |

### Context

`docs/ideas.md` P2-06 names a `start over` command. `FR-P2-18` requires stored history to be clearable, and the acceptance criterion asks for clearing to be verified by inspecting storage rather than by the interface reporting success.

### Options considered

1. Separate: `start over` ends the current conversation; a distinct control erases stored conversations.
2. One action that does both.
3. `start over` only, with no clear control.

### Decision

Option 1. `start over` empties the thread and forgets the chosen plan. Clearing saved conversations is its own control and deletes the storage key.

### Rationale

Option 2 makes a member who wanted a clean slate for one question lose every prior conversation, with no undo. Two verbs with two consequences is less surprising than one verb with a hidden second effect.

Option 3 fails `FR-P2-18` outright.

### Consequences

- Two controls where the mock draws one.
- `start over` forgetting the plan is deliberate: a new conversation should re-ask lazily per D-022 rather than inherit a plan the member may have chosen for a different question.

---

## Decision D-073 - The chat panel pins its header and composer

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4 |
| Status | accepted |
| Supersedes | - |

### Context

`.panel` is a single scrolling column, so the header, the "Talk to a person" button and the composer scroll away with the thread. The close control is a text button in a wrapping action row rather than an X at the top right, and `FR-13` requires the human path to be present in every state.

### Options considered

1. Pinned header and composer, with only the thread scrolling.
2. A minimal header with the actions behind an overflow menu.
3. Keep one scroll and move only the close control.

### Decision

Option 1. The panel becomes a three-row grid: header, scrolling thread, composer. The close control is an X at the top right of the title row.

### Rationale

Option 3 leaves FR-13 broken in the state where it matters most: a member who has scrolled into a long transcript cannot see the human path. Option 2 puts the voice toggle and help behind an extra tap for an audience with declining motor control, to buy vertical space a 40vw panel does not urgently need.

### Consequences

- The launcher, the full-page variant and the panel now share one layout rule rather than the panel inheriting the page's.
- The X is icon-only and needs an accessible name, and it must clear the 44px target minimum.

---

## Decision D-074 - Framer Motion 13.2.0 is added for interface motion

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4b, interface pass |
| Status | accepted |
| Supersedes | - |

### Context

The interface pass asks for motion on the panel, the mic and the progress messages. The project has no animation dependency; every prior effect is CSS.

### Options considered

1. Plain CSS animations, no new package.
2. Framer Motion, roughly 50KB gzipped.
3. Motion One, roughly 5KB, same author.

### Decision

Option 2, `framer-motion@13.2.0`, pinned exactly. Version checked against the registry rather than recalled.

### Rationale

The user's call. It brings enter and exit animation, which plain CSS cannot do for an element being removed from the React tree - the panel, the help region and each rotating progress message all mount and unmount, and CSS can only animate the entrance.

### Consequences

- Roughly 50KB gzipped added to a bundle currently 78KB gzipped. Material on a slow connection for an audience that mostly reads.
- Every animation must respect `prefers-reduced-motion`, which Framer Motion does through `useReducedMotion` rather than automatically.
- First runtime dependency in the browser bundle beyond React and icons.

---

## Decision D-075 - The assistant panel becomes a true modal overlay

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4b, interface pass |
| Status | accepted |
| Supersedes | amends the Stage 7 panel, which set `aria-modal="false"` |

### Context

The panel sat beside the page: no backdrop, page still scrollable, `aria-modal="false"`, focus free to leave. The pass asks for a dimmed backdrop, a locked page and click-outside to close.

### Options considered

1. Full overlay with focus held inside, `aria-modal="true"`.
2. Full overlay with focus free to leave.
3. Keep it beside the page.

### Decision

Option 1. Backdrop at 20% black, body scroll locked, click outside or Escape or the X closes it, and focus is held within the panel while it is open.

### Rationale

Option 2 is the trap it looks like it avoids. Once a backdrop covers the page, a keyboard user tabbing out lands on controls they cannot see, behind a dark layer, with no way to know where they are. A dialog that visually blocks the page must block focus too, or it is only a dialog for people using a mouse.

`FR-P2-23`'s no-focus-trap rule governs the **help region**, which remains a disclosure inside the panel. It says nothing about the panel itself.

### Consequences

- Focus returns to the launcher on close, which it already did.
- `aria-modal` flips to `true` and the panel gains a focus loop.
- Body scroll lock must be released on unmount or the page stays frozen after a close.

---

## Decision D-076 - A closed panel keeps what was typed

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4b, interface pass |
| Status | accepted |
| Supersedes | - |

### Context

Click-outside-to-close means a stray click discards a half-typed question.

### Options considered

1. Keep the draft and restore it on reopen.
2. Confirm before closing when the box is not empty.
3. Discard.

### Decision

Option 1. The draft survives a close and is put back on reopen.

### Rationale

This audience types slowly, and retyping a question is the real cost of a mis-click. Option 2 puts a decision in front of someone whose intent was to dismiss something.

### Consequences

- The draft outlives the panel, so it is held above the panel rather than inside it.

---

## Decision D-077 - Progress messages follow real stages, with a timed fallback

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4b, interface pass |
| Status | accepted |
| Supersedes | - |

### Context

A single static "Searching your plan documents" sits on screen for the whole wait, which measured 2.8 seconds to answer and longer with voice.

### Options considered

1. Messages driven by the events the server already sends, with a timed fallback if a stage runs long.
2. Purely timed rotation.
3. One message plus a moving indicator.

### Decision

Option 1. The stream already reports when retrieval begins, when a plan is needed and when the first token arrives; messages follow those. Within a stage that runs long, a softer line appears so nothing looks frozen.

### Rationale

Option 2 would display "checking your plan documents" after that had finished. It is a small untruth, and this is a product whose entire claim is that it does not state things it cannot support. Cheap honesty is still honesty.

### Consequences

- Message changes are uneven, because real stages are uneven. That is the point.
- The fallback timer must not advance past the last message for its stage, or it becomes option 2 by accident.

---

## Decision D-078 - Focus on the composer is drawn inside the field

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 4b, interface pass |
| Status | accepted |
| Supersedes | - |

### Context

The pass asked for the focus ring on the input to disappear while typing. `:focus-visible` matches on **every** focus of a text field, including a mouse click - browsers do this deliberately, because a text field must show where typing will land. So the ring cannot be conditional on the keyboard, and removing it fails `NFR-A11Y-04` and the test that forbids removing an outline.

### Options considered

1. Draw the same outline inside the field with a negative offset, plus a soft halo, so nothing sits outside the rounded shape.
2. Keep the outer ring, tucked in.
3. Remove it from the input.

### Decision

Option 1. `outline-offset: -2px` with a border weight change and a shadow halo on the field itself.

### Rationale

What made it ugly was a hard 3px rectangle sitting 2px outside a rounded pill, reading as a second box. Drawn inside, hugging the same radius, it becomes part of the control. Focus stays visible, the outline is never removed, and the test keeps passing without being weakened.

### Consequences

- The composer's focus treatment differs from the rest of the interface, deliberately, because it is the only control someone dwells inside.

---

## Decision D-079 - Long answers are grouped by cited source, not rendered as markdown

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | Long-answer readability |
| Status | accepted |
| Supersedes | - |

### Context

Long answers read as an undifferentiated wall. Measured on the last eval run: median answer 2 claims and 392 characters, but 9 of 36 carry 3 or more claims and 3 carry 5 or more. The worst, A-24, is nine sentences at identical visual weight.

The obvious fix - ask the model for markdown - is blocked three times over:

- `FR-32` and D-038 state that prose is rendered by the application, never by the model. The model returns typed claims each carrying citation ids, and markdown would hand rendering back to it.
- It needs a system-prompt change, and D-069 measured that cost precisely: faithfulness 1.000 to 0.989, and a pharmacy question the corpus cannot answer flipping from a refusal into an answer.
- Rendering model output as markup is an injection surface on a product whose corpus is scraped text.

### Options considered

1. Group neighbouring claims that cite the same sources, under a heading taken from that source's section.
2. As above, plus the first claim set a size larger as a lead.
3. Render three or more claims as a bulleted list.
4. Leave it alone.
5. Markdown from the model.

### Decision

Option 1. Grouping happens in the renderer, over the claims the payload already carries.

### Rationale

The grouping is a fact the system already holds - which claim cites what - rather than anything inferred from the words. No prompt change, no dependency, no markup from the model, so none of the three objections apply.

Option 3 reads as a checklist even when the claims are not a sequence, which is the structural dishonesty `frontend-design` warns about with numbered markers.

Option 4 was a real candidate at 8% of answers affected, and was rejected because the answers it affects are the process questions - appeals, grievances, dental limits - where a member most needs to find one part again.

### Consequences

- Grouping applies only at three or more claims, and only when neighbouring claims actually share sources. One group per claim is the same wall with headings added, so that case falls back to flat rendering.
- Claim order is never changed. The model returned a sequence and reordering it would change the answer.
- Near-duplicate claims become more visible, not less. A-24 opens with two claims that say nearly the same thing. Suppressing one would make the application decide which cited claims a member sees, which this product has not done; the repetition is left visible and recorded as an answer-quality signal instead.

---

## Decision D-080 - Member records are citable sources on a third router path

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 5 |
| Status | accepted |
| Supersedes | extends D-062 |

### Context

`FR-P2-29` requires one answer to cite a plan document and a member record separately, each attributed to its own source. Stage 2 solved the same shape for drug rows: a typed row is projected into the retrieved-chunk shape and travels the existing prompt, citation, validation and cite-or-refuse path unchanged.

### Options considered

1. The same projection, with the router gaining a third path alongside structured and RAG.
2. A separate answering path for member questions.
3. A new claim kind in the payload, distinguished by the model.

### Decision

Option 1. A record field becomes a citable source exactly as a drug row does, and `RoutePath` gains `member`.

### Rationale

Paths stay additive per D-062, so a combined question keeps both halves by construction rather than by a stitch that has to be got right. Option 2 would need the two paths joined by hand, which is the half-dropping D-062 exists to prevent.

Option 3 needs a system-prompt change, and D-069 measured that cost exactly: faithfulness 1.000 to 0.989 and a required refusal flipping into an answer. Nothing here touches the prompt; the model simply sees more sources.

### Consequences

- Cite-or-refuse binds record claims with no new code, satisfying `FR-P2-28` by construction.
- The router's confusion matrix grows a third class, and Stage 8 reports it.
- Member scoping is enforced in the query, not in the prompt. A prompt cannot be relied on to keep one member's data from another.

---

## Decision D-081 - The Part D stage is derived from spend, against per-plan thresholds read from the corpus

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 5 |
| Status | accepted |
| Supersedes | closes an `srs-p2.md` open question |

### Context

`srs-p2.md` left open whether the Part D coverage stage is seeded flat or worked out from spend.

### Options considered

1. Derive it from year-to-date drug spend.
2. Seed it as a flat field.
3. Seed it flat with a test asserting it agrees with the spend.

### Decision

Option 1. The stage is a function of spend against that member's own plan thresholds.

### Rationale

A record that says "catastrophic" beside a spend that says otherwise is exactly the kind of internal contradiction this product cannot afford, and option 2 permits it silently. Option 3 catches it but still maintains the same fact in two places.

### Thresholds, read from the corpus rather than recalled

| Plan | Yearly drug deductible | Out-of-pocket limit |
| --- | --- | --- |
| H5141-004 | $150 on tiers 3, 4 and 5 | $2,100 |
| H5141-007 | $220 on tiers 3, 4 and 5 | $2,100 |

### Consequences

- Thresholds differ by plan, so they are stored per member rather than as one constant.
- **No seeded member is on H8010-002.** Its Part D deductible is not stated in the converted Evidence of Coverage, and `CLAUDE.md` rule 6 forbids inventing it. Recorded as an open question rather than filled with a plausible number.

---

## Decision D-082 - A record citation names the record, the item and the field

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 5 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-28` requires a record-sourced claim to cite the record and the field, not a document. A document citation reads `Summary of Benefits 2026 · Plan H5141-004 · Doctor's Office`.

### Decision

`Your member record · Claim CLM-0031 · What you owe`.

### Rationale

The same three-part shape as a document citation - what it is, which one, which field - so both kinds scan as one list when a combined answer carries both. Naming the field is what `FR-P2-28` asks for; a date-led alternative reads more naturally but only half satisfies it.

### Consequences

- `citationLabel` grows a record branch beside the contract-wildcard branch D-056 added.
- Field names are member-facing, so they are written as a member would say them: "What you owe", not `member_owes`.

---

## Decision D-083 - Members are seeded from a typed module, not from a migration

| Field | Value |
| --- | --- |
| Date | 2026-09-08 |
| Cycle / Feature | P2 Stage 5 |
| Status | accepted |
| Supersedes | - |

### Context

Five synthetic members with enrolment, accumulators, claims, prior authorisations, appointments and an assigned provider each.

### Decision

A migration creates the tables; a typed TypeScript module holds the records and a command applies them.

### Rationale

A malformed record fails the build rather than the insert, and the synthetic labelling is checkable by test rather than by reading SQL. Data inside a migration is awkward to change: re-seeding would mean editing applied history or writing a second migration.

### Consequences

- One more command, `npm run seed:members`.
- Re-seeding is idempotent and safe to repeat, which is what makes the demo reproducible.

---

## Decision D-084 - A separate member cookie, minted fresh on every sign-in

| Field | Value |
| --- | --- |
| Date | 2026-09-09 |
| Cycle / Feature | P2 Stage 6 |
| Status | accepted |
| Supersedes | - |

### Context

An anonymous `clovbot_sid` cookie already exists, carrying rate limiting and the loop breaker. Signing in has to bind a member to a session somehow.

### Options considered

1. Keep the anonymous cookie as it is; mint a separate id, bound to the member row, on sign-in.
2. Reuse the same cookie and attach a member to it.
3. A second cookie that mirrors the first's lifetime.

### Decision

Option 1. `clovbot_member` is a distinct `HttpOnly; SameSite=Lax` cookie, generated fresh at sign-in and again discarded at sign-out.

### Rationale

Option 2 is session fixation: the id that existed before sign-in keeps working after it, so anyone who already knew that value inherits the authenticated session. Rotating on login is the standard defence and costs one `randomUUID`.

Keeping them separate also keeps the anonymous session's 24-hour rate-limit window from setting the authenticated session's lifetime, which FR-P2-35 caps at eight hours.

### Consequences

- Two cookies, and sign-out must clear the member one and end its row.
- A session row is the authority; the cookie is only a pointer, and a value that is not a UUID shape is refused before any query runs.

---

## Decision D-085 - Codes are stored as scrypt hashes, and an unknown address is answered identically

| Field | Value |
| --- | --- |
| Date | 2026-09-09 |
| Cycle / Feature | P2 Stage 6 |
| Status | accepted |
| Supersedes | - |

### Context

A six-digit code is a live credential with a million possibilities and a ten-minute life. Two questions follow: what the database holds, and what the endpoint reveals.

### Decision

Only a scrypt hash and a per-row salt are stored; the code exists in memory and in one email. The request endpoint returns the same body whether or not the address belongs to a member.

### Rationale

A plaintext column, or a fast hash, falls to an offline sweep of a million candidates the moment the table leaks. scrypt is deliberately slow, and at most five verifications per code makes that cost invisible.

Replying "no such address" would turn the endpoint into a membership oracle: anyone could enumerate which addresses are enrolled. The same reply either way costs nothing and removes that.

Expiry, single use and lockout are all decided **before** the code is compared, so a dead code cannot be probed for correctness after its window closes.

### Consequences

- A member who mistypes their address gets "a code is on its way" and no code. The copy says "if that address is on file" so the message is not a lie.
- Claiming a code marks it spent in the same statement that reads it, so two requests racing the same code cannot both succeed.

---

## Decision D-086 - Real addresses live in the environment, never in the repository

| Field | Value |
| --- | --- |
| Date | 2026-09-09 |
| Cycle / Feature | P2 Stage 6 |
| Status | accepted |
| Supersedes | extends FR-P2-40 |

### Context

FR-P2-40 planned for one member seeded with an operator-controlled address. The user supplied five, one per member, so any member can be demoed live.

`members.email` is unique and a code has to identify exactly one member, so five members cannot share one address.

### Decision

`OPERATOR_MEMBER_EMAILS` holds five addresses in member-id order, in `.env` only. The seed module keeps unreachable `@example.invalid` fallbacks, so the repository contains no personal data and the build works without the variable.

### Rationale

`CLAUDE.md` forbids personal data in specs, prompts and memory files, and requires an environment variable instead. Five real addresses in `src/members/seed.ts` would have been committed, and a case-study repository is the wrong place for anyone's inbox.

### Consequences

- A checkout without the variable seeds five members nobody can sign in as, which is the correct default for a public repository.
- The sending domain is `v-ai.org`, verified with Resend. Delivery was confirmed: the provider accepted a real send and returned success.

---

## Decision D-087 - Login detection is deterministic rules, and needs_login is its own outcome

| Field | Value |
| --- | --- |
| Date | 2026-09-09 |
| Cycle / Feature | P2 Stage 7 |
| Status | accepted |
| Supersedes | - |

### Context

`FR-P2-42` defines member-specific as "answering requires a value stored against that member". `NFR-P2-02` gates a false negative at zero and false positives at 95%. A turn was answered, refused, or an upstream failure.

### Options considered

For the decision: deterministic rules; a separate model call before retrieval; rules with a model fallback.
For the outcome: a fourth kind; a refusal carrying a login flag; an answered turn with a prompt to sign in.

### Decision

Deterministic rules, in the shape D-043 used for bucket C and D-061 used for the router. A fourth outcome, `needs_login`, decided before retrieval.

### Rationale

A zero-tolerance gate cannot rest on something probabilistic, and every decision has to be explainable by pointing at the rule that fired.

The outcome is its own kind because a refusal it is not: `FR-P2-43` requires the assistant to offer a way forward rather than decline. Folding it into refusals would also inflate the refusal rate, which is a gated metric, with turns that are not refusals.

Deciding it before retrieval means such a question never reaches the model, so it cannot leak a partial answer on its way to asking for a login - the same reasoning D-043 gives for bucket C.

### The rules needed adjacency, not proximity

Two bugs surfaced in the first draft, both from matching a possessive anywhere in the sentence:

- "what is my copay for a specialist **visit**" was gated as an appointment question. A price is not a visit.
- "what is the status of **my prior authorization**" was let through, because the general-phrasing exception matched "what is ... prior authorization".

Both are fixed by requiring the possessive to sit directly on the noun. "my prior auth" is theirs; "does my plan need prior authorization" is the rule in general.

### Consequences

- A phrasing nobody anticipated falls through to the documents rather than to a login prompt, which is the safe direction: the query layer already refuses member data without a session, so a miss cannot disclose anything.
- The rules are a maintenance surface. `eval/golden/login-set.json` carries 34 hand-labelled cases in both directions, scored inside `npm run eval` and gated separately per direction.

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
