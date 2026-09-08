# Project Context - Compressed Snapshot

> Single source of truth for "what exists right now." Read this before answering questions about project state. Do not re-derive from source.
>
> Current State, Key Decisions and Open Questions are edited in place. Session History is append-only: never rewrite a past entry, correct it in a new one.

| Field                | Value                                                   |
| -------------------- | ------------------------------------------------------- |
| Snapshot date        | 2026-09-08                                              |
| Current stage        | P1 Stage 10 built. Deploy steps are the user's to run.  |
| Last feature shipped | Release tooling: deploy, instrumentation, reproduction. |

---

## 1. What exists

- **Research briefing** - `docs/research-init.md`, 56 lines (dense, ~15K). Clover snapshot, Medicare Advantage rules that constrain the build, call-center economics for the ROI case, competitive landscape, 65+ UX findings, architecture notes. This is the only sourced-fact corpus in the repo right now.
- **Design system** - `design/DESIGN.md`, 405 lines, written and non-placeholder.
- **Working contract** - `CLAUDE.md`, rewritten this session. See section 3.
- **Specs, real and frozen** - `claude/srs.md` v1.1.0, 30 functional and 19 non-functional requirements. `claude/plan-p1.md` through `plan-p4.md`, staged build plans. `claude/design-decisions.md`, 34 ADRs. `docs/call-drivers.md`, `docs/testing-strategy.md`, `docs/build-journal.md`.
- **Corpus pipeline** - `src/corpus/`, nine modules. Four commands: `corpus:discover`, `corpus:fetch`, `corpus:convert`, `corpus:report`. Produces a timestamped snapshot under `data/` (gitignored).
- **RAG path** - `src/rag/`, eight modules: chunker, provenance, ingest planner, context generator, prompt, providers, store, CLI. Two commands: `ingest`, `ask`.
- **Migrations** - `migrations/002_hybrid_retrieval.sql`, applied by hand in the Supabase dashboard.
- **Acceptance script** - `scripts/stage4-check.ts`, prints the smoke-set and fusion numbers.
- **Eval harness** - `eval/`: 50-case golden set, faithfulness judge, structural citation check, scoring, committed results. Commands `eval` and `eval:calibrate`.
- **CI** - `.github/workflows/ci.yml`. Typecheck plus tests on every push; judge calibration and the golden-set eval on pull requests.
- **Retrievability report** - `docs/corpus-report.md`, generated.

## 2. What works (verified)

- **Corpus fetch and convert.** 14 documents for contract H5141, plans 004 and 007, 2026, Hudson County NJ. 0 failed, 0 blocked, 2 synthetic. The Evidence of Coverage is 199 pages converting to 498KB of text in 0.25s.
- **Two-plan column extraction.** One Summary of Benefits PDF serves plans 004 and 007 side by side. Each plan extracts to its own markdown, verified by hand against the source PDF: specialist copay $10 in-network / $20 out for 004, $2 / $15 for 007. No cross-plan leakage.
- **End-to-end cited answer.** `npm run ask -- "what is the specialist copay" --plan 004` returns the correct amount with document, contract, plan, plan year and section, in roughly 1.4s. Plan 007 returns its own different amount from the same source PDF.
- **Determinism.** The same question returns the same five chunk ids across runs.
- **Redaction.** "my member id is 1234567890" persists as "my member id is [redacted]".
- **TLS.** Supabase CA pinned, certificate verification on.
- **Full corpus indexed.** 1476 chunks across Summary of Benefits, Evidence of Coverage, Annual Notice of Change, formulary and public corporate pages, for plans 004 and 007. The pharmacy directory is deliberately excluded.
- **Ingest is idempotent.** Two consecutive runs report 0 new or changed, keep the same snapshot id, and leave 1476 rows with 1476 distinct ids and zero missing provenance.
- **Hybrid retrieval.** Dense HNSW and lexical GIN fused by Reciprocal Rank Fusion in one Postgres function, both halves scoped to the plan before ranking. Measured: rare drug ORSERDU is dense rank 9 and hybrid rank 1; the paraphrase "what does it cost to see a skin doctor" is absent from lexical and hybrid rank 2.
- **Smoke set.** 10 of 10 questions retrieve the expected source document.
- **Eval gates green with the whole set enforced, measured 2026-09-08.** Faithfulness **1.000** against a 0.90 floor. Structural compliance **100%**. Refusal rate **13.3%**. Bucket A **27/30**, bucket B **8/8**, bucket C **10/10**. All **50 of 50** cases are now enforced; Stage 5's baseline was 0.803, 76%, 17/30 with only 29 enforced.
- **Bucket C guardrails.** Ten triggers as deterministic rules evaluated before retrieval, so a guarded question never reaches the model. Emergencies are their own outcome kind and give 911 guidance rather than a refusal script.
- **Escalation.** Callback request pre-filled with question, plan context and documents searched, stored and confirmed, sending nothing anywhere. Loop breaker arms after two consecutive refusals, read from the turn log.
- **Rate limiting.** 20 questions per session per hour, 60 per IP per hour, counted in Postgres, answered with a readable message and the phone number.
- **Voice, verified live.** ElevenLabs primary, Fish Audio fallback, browser synthesiser last. Breaking the primary key falls through to Fish with the member told the voice changed; breaking both reaches the browser tier. Audio cached on disk under `data/audio/`, keyed on text, voice and provider: a repeat went 6433ms to 0.9ms.
- **Voice latency, measured for the first time.** Answer ready 2839ms median, first audio 4007ms median. Both original budgets were amended by D-046, one of them because it was impossible rather than missed.
- **The answer contract holds.** The model returns typed claims each carrying their own citation ids; a claim without one fails validation and is never rendered, so an uncited claim is structurally impossible rather than merely detectable. Refusal is a typed branch. Unanswered parts are named explicitly.
- **Every named Stage 6 edge verified** by `scripts/stage6-checks.ts`: datastore unreachable produces no factual claim, a below-floor question refuses, a partially covered question answers the supported part and names the gap, conflicting sources return the Evidence of Coverage value and state the disagreement, a citation with no plan year refuses rather than rendering, and tokens stream.
- **Judge calibrated.** 14 sentence-level judgements across six fixtures, zero disagreements. The deliberately unfaithful fixture scores 0.00, the partial one 0.67.
- **Synthetic provider data is not cited as fact.** Asked whether a named doctor is in network, the assistant states the directory is demo data and routes to a human. The Stage 1 banner mitigation holds.
- **Reranker.** Local ONNX cross-encoder, `Xenova/ms-marco-MiniLM-L-6-v2`, ~280ms at a pool of 10.
- **Chat surface.** React 19 and Vite in `web/`, a Node API in `src/server.ts` streaming server-sent events. Host page with launcher, a 40% viewport panel that is full width on mobile, and a `/assistant` full-page route sharing one component.
- **Lazy plan context works both ways, verified live.** "how do I file an appeal" answers without asking. "what is my specialist copay" returns the plan chips first, then answers $10 for plan 004. This is what the mock README calls the subtlest thing to get right.
- **Type scale is two-tier** (D-042). The reading surface, question and answer, sits at 18px/1.6 with a 68ch measure; interface chrome uses the DESIGN.md scale. The composer input stays at 18px because iOS zooms fields below 16px, and the citation sits at 14px rather than the mock's 11px chip.
- **Deployment.** `npm run deploy:api` deploys the API to Cloud Run in one command, and `.github/workflows/deploy-api.yml` does the same on a push to `main` after tests pass. Vercel serves the static build at `clovbot.v-ai.org` and proxies `/api` to Cloud Run, which keeps the session cookie first-party. Steps are in `README.md`.
- **Operator tools.** `npm run insights` reports containment, refusal reasons, top unanswered questions and feedback. `npm run reproduce -- <turn-id>` rebuilds the exact retrieved context behind a past answer, per NFR-OPS-02. Both are command line only, because the turn log holds member questions.
- **Secret scan.** `tests/unit/no-secrets.test.ts` scans every git-tracked file for credential shapes and runs in the existing CI gate. Verified by planting a key-shaped string and watching it fail.
- **Tests.** **375 passing, zero failing.**

**Known verification gap, the largest in the project.** Five of Stage 7's eleven acceptance criteria need browser tooling that was approved but deferred to P3 (D-040): the axe scan, the keyboard walk, computed-style focus and target checks, 200% reflow, and the throttled Lighthouse run. The surface is built to WCAG 2.2 AA and guarded by 22 static assertions, but conformance is **asserted, not tested**. Also unverified: contrast ratios, screen-reader reading order, keyboard traps.

**NFR-PERF-02 amended** by D-041 from 800ms to 2000ms unthrottled, against a measured 1632ms. The 800ms figure predated any code. NFR-PERF-03 and 04, the voice budgets, remain the only performance numbers with no evidence behind them, because Stage 2 was skipped.

## 3. Locked decisions

Set by the user, binding for the whole project. Full statement in `CLAUDE.md` section 1.

- Spec before code. No production code without an entry in `srs.md` or `features.md`.
- TDD, no exceptions. Failing test first.
- **Zero real PHI, ever.** No real member data at any version. Auth, claims and prior-auth status are permitted from v1.1 over synthetic records only, labelled synthetic throughout. D-047 amends D-001; v1.0.0 shipped with no identity.
- **Cite or refuse.** Every bot answer names its source document, or it declines and offers a human. No third path.
- Design forks go to the user with options and tradeoffs. Claude does not decide. The call is logged as an ADR in `design-decisions.md`.
- No invented Clover, Medicare, or CMS facts. Only `docs/research/` and the scraped corpus.
- Ask before adding any dependency.
- Zero monetary cost. Free tier, open source, or local only.

The research briefing's recommended shape (RAG over public plan documents, escalate everything else) matches these constraints but is **not yet ratified** as the product decision. That happens in `/spec-requirements`.

## 4. What's next

1. **Run the deployment.** `migrations/004_release.sql` is not applied yet, and FR-27 feedback does not record until it is. Then Google Cloud setup, `npm run deploy:api`, the Cloud Run URL into `vercel.json`, and the CNAME at name.com.
2. **Nothing is measured under the NFR-PERF-05 throttled profile.** Every figure so far is unthrottled and on a laptop. `eval/results/real-device-latency.md` is the template to fill from a phone.
3. **Accessibility verification** remains the largest outstanding risk. A single browser-tooling session at P3 closes five acceptance criteria at once.
4. **Spanish** is specified as P3 Stage 4, with the Spanish corpus already confirmed available in the catalog.
5. **Two register variants still refuse.** A-03 and A-18 score 0.0006 and 0.0002, below the 0.001 floor. The floor cannot separate them from nonsense, which is the cost D-038 records rather than hides.
6. **No screen-reader pass has been done.** Stage 7's eleventh criterion, and the one no tooling replaces.
7. **ADV-01 refuses rather than answering.** The injection attempt is declined outright, which is safe but not what the golden case expects.
8. **Stage 2, deferred** - the voice latency spike was skipped. NFR-PERF-03 and 04 stay unmeasured until Stage 9.
9. **Gemini key** - rejected as invalid, so the D-034 fallback has never executed.

## 5. Active environment

- **Branch:** `development` (main branch is `main`)
- **Language / framework / runtime:** TypeScript strict, Node 26, native type stripping. No framework.
- **Package manager / test runner / deploy target:** npm · Vitest · not yet deployed
- **Runtime dependencies:** `pg` only. Dev: `@types/node`, `@types/pg`, `typescript`, `vitest`.
- **System prerequisites:** `pdftotext` and `pdfinfo` from poppler.
- **Services running:** Supabase Postgres with pgvector, `chunks` and `turns`. Azure OpenAI gpt-4o and text-embedding-3-small.
- **Env vars:** documented in `.env.example`. `GEMINI_API_KEY` is present but the key is rejected, so the fallback is untested.
- **Budget:** $0. See the zero-cost rule.

## 6. Constraints

- 48-hour case study interview, solo, roughly 40 working hours. Scope for a narrow defensible demo, not breadth.
- Audience is Clover Health members, mostly 65+. WCAG AA, large targets, plain language are requirements, not polish.

## 7. File map

| Area             | Path                         | State          |
| ---------------- | ---------------------------- | -------------- |
| Working contract | `CLAUDE.md`                  | written        |
| Research corpus  | `docs/research-init.md`      | written        |
| Design system    | `design/DESIGN.md`           | written        |
| Requirements     | `claude/srs.md`              | scaffold       |
| Plan             | `claude/plan.md`             | scaffold       |
| Features log     | `claude/features.md`         | scaffold       |
| Decisions (ADR)  | `claude/design-decisions.md` | scaffold       |
| Application code | none                         | does not exist |
| Test suite       | none                         | does not exist |

## 8. Open questions

- [x] Stack. TypeScript, Node, Supabase pgvector, Azure OpenAI. D-018, D-034.
- [x] What the v1 corpus is. Contract H5141, plans 004 and 007, 2026, Hudson County NJ, fetched through an undocumented JSON API and snapshotted. D-030, D-033.
- [ ] What "cite the source" renders as for a 65+ reader. The CLI prints document, contract, plan, plan year and section; the web surface in Stage 7 needs a real design.
- [ ] Escalation path when the bot refuses. Stage 8.
- [ ] Reranker choice. Still the load-bearing open question in `srs.md` §10, and Stage 6 cannot start without it.
- [ ] gpt-4o versus gpt-4.1-mini. gpt-4o is deployed and in use. Stage 5's eval harness can measure whether the cheaper model holds the answer contract.

---

# Session History

> Append-only. Newest at the bottom. One entry per session that changed code, design, or architecture.
>
> Template:
>
> ```
> ## YYYY-MM-DD - <title>
> **Did:** <what changed>
> **Files:** <path> (create|update|delete) - <why>
> **Decisions:** <decision> - <rationale>
> **Open:** <follow-ups>
> ```

## 2026-09-07 - Working contract locked

**Did:** Established the behavior contract for the whole project before any spec or code. Rewrote `CLAUDE.md` from the 399-line scaffold template into a 94-line contract carrying the user's eight rules. Logged it in the changelog. Populated this file with real state.

**Files:**

- `CLAUDE.md` (update) - replaced template with the contract. Cut unfilled Environment placeholders and a stale block referencing another repo's stack (Electron, Drizzle, `lib/db/repo/**`) that would have misled every session.
- `CHANGELOG.md` (update) - logged the contract under `[Unreleased] > Changed`.
- `claude/context.md` (update) - this file, replaced scaffold with real state.

**Decisions:**

- ADRs live in `claude/design-decisions.md`, not the `docs/design-decisions.md` the user first named. Reason: the file already exists and the `/spec-*` skills read and write it. Two logs would drift. Flagged to the user, reversible.
- The changelog entry stands even though a contract rewrite is invisible to a member, which the contract's own section 8 argues against. Flagged, user's call.

**Open:** Everything in section 8. Next action is `/spec-requirements`.

## 2026-09-07 - Stage 1 corpus spike and Stage 3 thinnest answer

**Did:** Built the corpus pipeline and the first end-to-end cited answer. Stage 2 skipped at the user's instruction.

**Files:** `src/corpus/*` (create) - discovery, fetch, convert, column extraction, synthetic provider data, report, snapshot store, CLI. `src/rag/*` (create) - chunker, prompt, providers, store, CLI. `src/logging.ts` (update) - implemented FR-31 redaction, which Stage 3 needed before it could persist a question. `.env.example`, `certs/supabase-ca.crt` (create). 76 corpus tests and 27 RAG tests added.

**Decisions:** D-030 discovery snapshot replayed. D-031 column split by bounding-box gutter. D-032 plan 004, superseded same session by D-033 plans 004 and 007. D-034 Gemini generation fallback, never embeddings.

**What the live run taught:**

- Clover's plan documents are behind two undocumented JSON endpoints. `zipcode=` is accepted and silently ignored; only `county_id` filters, so a wrong parameter returns all five states with no error. The parser asserts the returned set is state-scoped rather than trusting the request.
- The Summary of Benefits is one PDF for two plans, side by side. Extracting the wrong column is a silent wrong answer on the highest-volume call driver. Header midpoints do not locate the column break, because headers are centred; the gutter has to be found empirically.
- Temperature 0 is not determinism. The same refusal question cited a disclaimer chunk on one run and nothing on the next. This is the argument for Stage 6's confidence floor rather than trusting the model to self-refuse.

**Open:** Reranker choice blocks Stage 6. Gemini key invalid. Voice budgets unmeasured.

## 2026-09-08 - Stage 4: full ingest and hybrid retrieval

**Did:** Generalised chunking to every document kind, added contextual prefixes, plan-year enforcement, idempotent ingest, and Reciprocal Rank Fusion over dense plus lexical retrieval. Indexed 1476 chunks.

**Files:** deleted `src/pipeline.ts`, `src/corpus.ts`, `tests/integration/` - they encoded `contractId: "H5141-001"`, merging contract and plan, which would have reintroduced the leak D-033 exists to prevent. Created `src/rag/{provenance,ingest,context}.ts`, `migrations/002_hybrid_retrieval.sql`, `scripts/stage4-check.ts`. Rewrote `src/rag/chunk.ts` and `src/rag/store.ts`. `src/types.ts` Provenance now carries planId.

**Decisions:** D-035 deterministic contextual prefixes from headings, model only for the 1.7% with no heading. D-036 pharmacy directory excluded from the index.

**What the live run taught:**

- **Chunk ids omitted the document, so twelve chunks collided and overwrote each other.** Corporate pages share headings like "Learn More". Silent content loss that only surfaced because idempotency reported one chunk permanently changed.
- **LLM-generated context makes ingest non-idempotent.** Regenerating each run produced different text, so unchanged chunks looked changed and re-embedded forever. Frozen to disk, as `docs/testing-strategy.md` section 4 already required.
- **The Azure quota is 29,000 tokens per minute, not requests.** Retry alone could not clear it. Pacing against a token budget, plus persisting each batch, made a full ingest survivable.
- **A check that cannot fail is worse than no check.** The first fusion measurement matched any chunk from the right document, so every mode scored rank 1 and the criterion looked met. Matching the chunk that actually contains the term revealed dense ranking ORSERDU ninth.
- **D-004 is narrower than "hybrid is better".** For a common drug dense is already rank 2. Fusion earns its complexity on rare tokens and on paraphrases lexical cannot see at all.

**Open:** Reranker choice blocks Stage 6. Gemini key invalid. Voice budgets unmeasured.

## 2026-09-08 - Stage 5: golden set and eval harness

**Did:** Built the 50-case golden set and the harness that scores it. Ran it against the Stage 4 system and recorded the first real numbers.

**Files:** created `eval/golden/golden-set.json`, `eval/harness/{score,run,calibrate}.ts`, `eval/judges/faithfulness.ts`, `tests/fixtures/answers/judge-fixtures.json`, `.github/workflows/ci.yml`, `tests/unit/eval-{score,fixtures}.test.ts`. Committed `eval/results/`.

**Measured:** faithfulness 0.803 against a 0.90 floor, structural compliance 76%, refusal rate 0.0%, bucket A 17 of 30. Build fails, as designed.

**Decisions:** D-037 resolves the reranker open question as a local ONNX cross-encoder, model chosen by measurement in Stage 6.

**What the run taught:**

- **Stage 4's chunk id change silently broke citation parsing.** New ids carry the document kind, which contains underscores; the citation regex allowed only letters, digits and hyphens. Every valid citation parsed as none, so correct cited answers were recorded as refusals. It looked like a plausible outcome rather than an error, which is why it survived a whole stage.
- **The dominant quality gap is per-claim citation.** The model cites its first sentence and leaves later factual sentences uncited. That is precisely what FR-32 exists to make structurally impossible.
- **Refusal cannot be inferred from citation count.** An answer that declines but cites the document explaining where to go is neither a refusal nor a factual answer under that heuristic.
- **The synthetic provider directory mitigation works.** The assistant states the directory is demo data rather than citing invented doctors, which was the rule 6 risk raised when synthetic data was approved.

**Open:** Stage 6 reranker model selection. Gemini key invalid. Voice budgets unmeasured.

## 2026-09-08 - Stage 6: reranking, confidence floor, and the answer contract

**Did:** Added a local ONNX cross-encoder, calibrated a confidence floor against measured data, and replaced prose generation with FR-32's structured payload. All three eval gates went green.

**Files:** created `src/rag/{rerank,payload,answer-turn}.ts`, `scripts/{rerank-spike,floor-calibrate,stage6-checks}.ts`; implemented `src/answer.ts` and `applyConfidenceGate`; added streaming to `src/rag/providers.ts`; rewired `src/rag/cli.ts` and the eval harness onto one shared pipeline. Dependency `@huggingface/transformers@4.2.0`.

**Measured:** faithfulness 0.803 to 0.988, structural compliance 76% to 100%, bucket A 17/30 to 25/28, refusal rate 13.3%.

**Decisions:** D-037 gained its measured numbers. D-038 amends D-016. D-039 removes automated conflict detection.

**What the measurements taught:**

- **The reranker score cannot be the confidence signal.** The same question scores 0.998 phrased tersely and 0.0005 phrased the way a member actually speaks. Out-of-corpus questions top out at 0.0002, so a grandmother asking about cover on a trip abroad is indistinguishable from "what is the capital of France". Ordering is fine, at 96-100% accuracy@5; only the scalar is unusable.
- **A spurious conflict detector is worse than none.** Comparing amounts across chunks fired on unrelated benefits, and telling the model a conflict existed made it declare a correct Clover document incorrect and invent a $25 figure.
- **The Evidence of Coverage table of contents was being read as headings.** Body chapters carry their title on the following line while contents entries carry it inline, so every chunk inherited a heading from a page-number line. Fixing it cut EOC chunks from 656 to 318 and made sections meaningful.

**Open:** time to first token 1632ms against an 800ms budget. Two register variants below the floor. Stage 8 stubs.

## 2026-09-08 - Stage 7: the member-facing chat surface

**Did:** Built the host page, launcher, panel and full-page assistant route in React and Vite, with a Node server streaming answers over server-sent events. Lifted the mock's type scale to the 18px accessibility floor.

**Files:** created `web/` (index.html, tokens.css, app.css, App.tsx, api.ts, components/Assistant.tsx), `src/server.ts`, `src/rag/plan-scope.ts`, `vite.config.ts`, `tests/unit/{plan-scope,a11y-static}.test.ts`. Dependencies react, react-dom, vite, @vitejs/plugin-react and their types.

**Decisions:** D-040 defers accessibility tooling to P3, with the gap stated. D-041 amends NFR-PERF-02 to the measured number.

**What building it surfaced:**

- **A live D-026 violation in shipped code.** `src/rag/payload.ts` hardcoded Clover's real number, `1-888-778-1478`, in the escalation text every refusal renders. D-026 had decided on an obviously-fake placeholder precisely so an unaffiliated public deploy cannot route real members to a real call centre. Replaced, with a test asserting the real number never appears.
- **The corpus reproduces that number anyway**, because the Evidence of Coverage contains it and answers quote it under citation. Accepted on the user's call, since it is quoted from a public document rather than published as this site's own support line.
- **The mock's own README was the most valuable file in the design folder.** It listed six conflicts with frozen requirements before a line was written, and the type scale conflict alone would have failed four acceptance criteria.

**Open:** accessibility verification deferred; no screen-reader pass; Stage 8 stubs.

## 2026-09-08 - Stage 8: guardrails and escalation

**Did:** Implemented the ten bucket C triggers as rules before retrieval, the loop breaker, language detection, the callback request, and per-session and per-IP rate limiting. Flipped bucket B and C from observed to enforced and re-ran the eval.

**Files:** created `src/guardrails.ts`, `web/src/components/CallbackPanel.tsx`, `migrations/003_guardrails_escalation.sql`, `scripts/stage8-checks.ts`, `tests/unit/{guardrails,escalation}.test.ts`. Implemented `src/session.ts` and `src/language.ts`, the last two stubs from session one. Extended `src/server.ts` and `src/rag/store.ts`.

**Measured:** all 50 cases enforced, up from 29. Faithfulness 1.000, structural 100%, refusal 13.3%, bucket A 27/30, B 8/8, C 10/10. Every Stage 8 acceptance criterion passes against the live database.

**What the run taught:**

- **Rules over-refuse, and the eval found where within one run.** "If I end up in the emergency room what am I looking at paying" matched the bare word "emergency"; "how long do I have to file an appeal" matched filing without matching the exception for explaining it. Bucket A fell to 25/30 until both were fixed, then rose to 27/30. Neither would have been visible without enforcing the whole set.
- **Enforcing a bucket is what makes its number mean anything.** Bucket B and C had been passing since Stage 5 purely because the model happened to decline. Marking them enforced changed nothing about the code and everything about what the report claims.
- **A guardrail that runs after generation is not a guardrail.** Deciding before retrieval means a guarded question never reaches the model, so there is no partial answer to leak on the way to a refusal.

**Open:** voice budgets unmeasured, accessibility verification deferred, two register variants below the floor.

## 2026-09-08 - Stage 9: voice

**Did:** Built the voice loop. Mode toggle persisted, microphone with both hold and tap, editable transcript, spoken answers alongside written ones, provider chain with an audio cache. Measured the two voice latency budgets for the first time.

**Files:** created `src/voice/{cache,chain,providers}.ts`, `web/src/voice.ts`, `web/src/components/VoiceComposer.tsx`, `scripts/stage9-checks.ts`, `tests/unit/voice-chain.test.ts`. Extended `src/server.ts` with `/api/speak` and `/api/transcribe`.

**Decisions:** D-045 drops the live partial transcript and amends FR-18. D-046 replaces both voice latency budgets with measured values.

**What building it taught:**

- **A requirement can be impossible rather than unmet.** NFR-PERF-04 asked for a complete spoken answer within 4 seconds. Speech runs at roughly 18 characters per second, so the answers tested take 17 to 31 seconds to say. The requirement had conflated beginning to speak with finishing, and no amount of engineering makes speech faster than speech.
- **The cheap privacy shortcut was the wrong trade.** Live partial transcription would have meant streaming a member's spoken health question to Google for reassurance while they talk, when the editable transcript is what actually protects them from a mis-heard question. FR-18 was amended rather than met that way.
- **Read the provider spec, do not recall it.** Both request shapes were taken from the live OpenAPI documents. The realtime speech-to-text endpoint the plan assumed does not exist in the REST API at all, which would have been discovered much later.
- **Tests passing does not mean the server starts.** A TypeScript parameter property compiled fine under Vitest and crashed Node's strip-only loader on boot. Nothing in 343 passing tests covered "does the process start".
- **Skipping Stage 2 cost what the plan said it would.** These numbers were available at hour 6 for the price of a throwaway page and arrived at Stage 9 with the loop already built on them. Nothing needed rebuilding, which was luck.

**Open:** nothing measured under the throttled profile; accessibility verification deferred; ElevenLabs key is scoped without quota read, so the free-tier ceiling is unknown.

## 2026-09-08 - Stage 10: release tooling

**Did:** Built everything Stage 10 needs that is not a manual step: container, one-command deploy, CI deploy, secret scan, instrumentation, answer reproduction, and the FR-27 feedback path that had never been wired.

**Files:** created `Dockerfile`, `.dockerignore`, `vercel.json`, `scripts/deploy-api.sh`, `.github/workflows/deploy-api.yml`, `src/ops.ts`, `migrations/004_release.sql`, `tests/unit/no-secrets.test.ts`, `eval/results/real-device-latency.md`. Extended `src/rag/store.ts`, `src/server.ts`, the browser client, and `README.md`.

**What building it surfaced:**

- **FR-27 recorded nothing.** The "Did this answer your question?" control had been React state since Stage 7: never sent, never stored, and a Stage 10 acceptance criterion depends on it. Three stages passed with the control looking finished.
- **`reproduceTurn` had been deleted at Stage 4** along with `pipeline.ts`, and NFR-OPS-02 depends on it. Rebuilt against the turn log rather than the removed abstraction, and it now reports a chunk that is no longer in its snapshot as a finding rather than skipping it.
- **The deployment target changed what the code could assume.** `latestSnapshotId()` read a gitignored directory on every request, and the audio cache wrote to a fixed path. Neither survives a container. Both are configurable now, which took two lines because the coupling was shallow.
- **A secret scan did not need a new tool.** Scanning git-tracked files for credential shapes inside the existing suite satisfies NFR-SEC-03 and gates CI already. Proven by planting a key-shaped string and watching the test name the file.

**Open:** migration 004 unapplied; the deploy itself; throttled real-device numbers.

## 2026-09-08 - Production 503 on every question

**Did:** Fixed the deployed service answering `/api/plans` while 503ing every `/api/ask`.

**Cause:** `scripts/deploy-api.sh` builds the `--set-env-vars` string with gcloud's custom-separator syntax, `^@@^`, and repeated that declaration for each variable rather than the separator alone. Cloud Run received `^DATABASE_URL`, `^AZURE_OPENAI_API_KEY` and the rest, so `connect()` threw on every question. `connect()` sat outside `handleAsk`'s try, so the throw became an unhandled rejection and killed the process; Cloud Run returned 503 and restarted, once per question.

**Files:** fixed `scripts/deploy-api.sh` (separator), added a boot-time `connect()` to `src/server.ts`, added `tests/unit/deploy-config.test.ts`. 379 tests pass.

**Why `/api/plans` looked healthy:** it serves a constant. Nothing in the verification step touched the database, Azure or the reranker.

## 2026-09-08 - v1.0.0 released

**Did:** Cut the release. `CHANGELOG.md` moves everything under `[Unreleased]` into `[1.0.0] - 2026-09-08` and opens a fresh unreleased section; `package.json` goes to 1.0.0; `claude/plan-p1.md` marks its stages.

**Shipped:** Stages 1 and 3 through 10. Cited answers over a two-plan 2026 NJ PPO corpus, hybrid retrieval with a local cross-encoder reranker, guardrails and escalation, voice in and out, and a public deploy on Cloud Run behind Vercel at the project domain.

**Not shipped, and recorded as such:** Stage 2 was skipped, so the voice budgets were measured at Stage 9 rather than hour six (D-046). Stage 7's accessibility verification is deferred to P3 (D-040). No throttled real-device latency numbers exist; `eval/results/real-device-latency.md` is still a stub.

**Measured at release:** faithfulness 1.000, structural validity 100%, refusal rate 13.3%, bucket A 27/30, B 8/8, C 10/10. 379 tests pass.

**Open:** `--min-instances 1` bills about $21/month for an idle container; no budget alert on the billing account.

## 2026-09-08 - P2 requirements pass and the contract amendment

**Did:** Four rounds of cross-questioning covering all eight stages of `claude/plan-p2.md`, then wrote `claude/srs-p2.md`. No P2 code yet.

**Files:** created `claude/srs-p2.md` (53 FR, 12 NFR, 8 open questions, 28 acceptance scenarios). Amended `CLAUDE.md` rule 3 and section 3 above. Appended D-047 through D-052.

**The contract changed.** Rule 3 was "Zero PHI in v1. No member auth." P2 stages 5-8 build member auth over synthetic records, so the rule as written forbade the plan. It is now "Zero real PHI, ever" - which binds harder, because the original expired at v1. D-047.

**What the questioning surfaced that the plan did not say:**

- **Stage 1 is less done than v1.0.0 makes it look.** Plans 004 and 007 already return different amounts, but they share one contract, and the golden set has one paired question against the five the stage requires. The real work is a second *contract*, H8010-002 HMO, which exists in the Hudson County catalog alongside the four H5141 PPOs.
- **`CONTRACT_ID` is a single environment variable.** Contract is assumed constant across the server, the retrieval scope, the turn log's `planContext` and the web chips. A second contract breaks all four, so plan identity becomes a typed pair (D-049) rather than a string with a hyphen in it.
- **D-007's provider half cannot honestly ship.** The provider directory is ten invented rows. Exact structured search over invented data produces a confident, precise, wrong answer about a member's own doctor, which is the failure the product exists to avoid. Formulary only, provider questions keep refusing (D-051).
- **"Member-specific" cannot mean "says my".** v1 already answers "what is my specialist copay" from public documents. The classifier's test is where the answer is stored, not how the question is worded, and the zero-tolerance false-negative gate is meaningless without that definition.
- **The classifier cannot be the enforcement.** A zero-tolerance gate on a classifier is a wish. Member-scoped queries are unreachable without a bound session, so a classifier miss cannot disclose a record - the classifier decides what to *offer*, not what is *permitted*.
- **Stage 4 and Stage 6 collide.** Local history plus sign-out on a shared family device: signing out clears member-sourced turns and leaves public ones.

**Open:** H8010's Summary of Benefits layout is unverified and `pdfToPlanColumn` may not fit it. Resend needs a verified sending domain. Six other questions in `srs-p2.md` section 10.

**Next:** `/spec-feature` Stage 1, second contract indexed.

## 2026-09-08 - P2 Stage 1: second contract indexed

**Did:** Indexed H8010-002 Classic (HMO) alongside the H5141 PPOs, and made plan scoping provably load-bearing. Eight sub-stages, each its own commit point.

**Files:** created `src/corpus/scope.ts`, `migrations/005_contract_wildcard.sql`, `scripts/plan-scope-check.ts`, `web/tsconfig.json`, `web/src/vite-env.d.ts`, three test files and one corpus fixture. Changed `src/types.ts`, `src/corpus/{cli,columns,types,report}.ts`, `src/rag/{ingest,provenance,payload,store,cli}.ts`, `src/server.ts`, `eval/harness/run.ts`, `eval/golden/golden-set.json`, the web client, `.env.example`, `scripts/deploy-api.sh`, `tsconfig.json`, `package.json`.

**Verified:** 1801 chunks across two contracts. "What is my out of pocket maximum" returns $6,000 under H8010-002 and $9,250 under H5141-004, each cited. 300 retrieved rows checked across three plans, zero cross-plan leaks, and the check shown capable of failing. Eval on 60 enforced cases: faithfulness 1.000, structural 100%, refusal 13.3% down to 10.0%, bucket A 90.0% up to 92.5%. The failing set is identical to v1.0.0 - A-03, A-18, A-28, ADV-01 - so nothing regressed. 419 tests pass.

**What building it surfaced:**

- **The stage looked half-done and was not.** Plans 004 and 007 already returned different amounts, so the exit signal appeared met. But they share one contract, the golden set held one paired question against the five required, and `CONTRACT_ID` was a single environment variable threaded through the server, retrieval, the turn log and the web chips. The visible half was finished; the load-bearing half had never been built.
- **A latent extractor bug no document had triggered.** `extractPlanColumn` inherited a page's absolute column gutter to pages without a header row. H5141 escapes it because every one of its table pages carries a header. H8010's page 11 does not, and the document alternates recto and verso margins, so the inherited boundary cut a word in half. Measured: page 11's own gutter is 354.52, page 9's is 338.02, page 10's is 359.58. Fixing it by shifting an inherited boundary would have been wrong - the gutter is content-derived per page, not a rigid translation of the margin.
- **Fetching the document first was worth more than the plan predicted.** The choice to pull one PDF into scratch before speccing turned two open questions into facts and found the bug before a line of stage code existed. The plan's own fallback - "spec first, treat layout as a risk" - would have found it mid-implementation.
- **`convertAll` never retries a failed conversion.** An entry whose status is not `ok` is passed through untouched, so a fixed converter cannot prove itself without a full re-fetch. Named, not fixed.
- **`web/` had never been typechecked.** The root tsconfig include listed `src`, `tests`, `eval`, `scripts`, and Vite strips types without checking them. Every browser type error since Stage 7 has been invisible. Now gated by `npm run typecheck`, which runs both projects.
- **`connect()` never dialled.** It constructs a `pg.Client`, so the boot check threw on a missing `DATABASE_URL` or an unreadable CA and nothing else, despite a comment saying a broken environment must fail to start. A wrong password or an empty index started cleanly. Boot now queries the index and refuses to start without one.
- **Two collisions that would have produced passing-but-meaningless tests.** H8010-002 and H5141-004 charge the same $10 specialist and $0 primary care copay, so those pairs prove nothing about scoping. Found by reading the converted corpus rather than by assuming the plans differ everywhere.
- **A citation was one branch from printing "Plan \*"** to a member, once the formulary became contract-wide.

**Open:** FR-P2-05 has no automated coverage; there is no component harness and adding one is a deferred dependency decision. The leakage check needs a live index and is not in CI. `migrations/005_contract_wildcard.sql` must be applied to any other environment.

**Next:** Stage 2, structured formulary lookup and the router. D-051 narrowed it: formulary only, provider search keeps refusing.

## 2026-09-08 - P2 Stage 2: structured formulary lookup and the router

**Did:** Built D-007's typed half. The formulary is parsed into 2,468 typed rows, a deterministic router selects between the table and prose, and both paths can answer one question.

**Files:** created `src/corpus/formulary.ts`, `src/rag/router.ts`, `migrations/006_drugs_and_routing.sql`, `eval/golden/routing-set.json`, four test files and one corpus fixture. Changed `src/rag/{chunk,store,answer-turn,cli}.ts`, `src/corpus/{convert,cli,snapshot}.ts`, `src/server.ts`, `eval/harness/run.ts`.

**Verified:** 2,468 rows, 105 categories, none uncategorized, 1,632 distinct drug names. `what tier is atorvastatin on` returns Tier 1 cited to the row. `is eliquis covered and how do I appeal a denial` returns the tier from the table and the appeal process from the Evidence of Coverage, each cited separately. Router 32/32 with zero drug questions reaching prose alone. Eval unchanged from Stage 1 on all six answer metrics, same four failing cases. 451 tests pass.

**What building it surfaced:**

- **A live v1.0.0 defect, found by probing rather than by a failure.** `FORMULARY_CLASS` admitted no lowercase and no parentheses, so `ANTILIPEMICS, HMG-CoA REDUCTASE INHIBITORS` never matched and ten statins were indexed and cited under the class above them. Visible in the committed eval results since Stage 5. A missed heading raises nothing; the drugs beneath it silently inherit the previous class.
- **The old regex was doing work by accident.** Widening it to admit lowercase immediately broke the existing tests, because a drug row contains "15mg" and its lowercase had been disqualifying it. The real discriminator is the tier digit, which is what the typed parser uses, so one rule now serves both paths.
- **Layout text loses half of two columns.** All 2,468 rows survive `pdftotext -layout`, but 564 strength continuations and 379 requirement continuations do not, and one line carries both halves at once. A drug would have read as carrying a quantity limit when it also requires step therapy.
- **A page-number rule that ate strengths.** `/^\d+\b/` matched the continuation "10 mg" and collapsed three distinct strengths into one row. Caught by asserting no two rows share a printed name, not by the parse appearing to succeed.
- **Two test labels were wrong and the corpus said so.** Ozempic and Mounjaro were labelled as not covered on assumption. Both are on this formulary at Tier 3 with prior authorization. The labels were corrected; the router was right.
- **A structured answer needed no parallel machinery.** Projecting a row into the retrieved-chunk shape made it travel the existing prompt, citation, validation and cite-or-refuse path unchanged, and an exact row outscores the confidence floor so the gate needed no exception.

**Open:** provider search is not built and will not be (D-051). The router cannot match a misspelled drug name and falls through to prose. Two albuterol rows collapse on the primary key, identical in tier and requirements, differing only in which brand they are the generic of.

**Next:** Stage 3, answer card and freshness.

## 2026-09-08 - P2 Stage 3: freshness delivered, the answer card was not

**Did:** Built everything Stage 3 asks for, measured that the last piece cost more than it was worth, and shipped without it on the user's call.

**Files:** created `src/freshness.ts`, `migrations/007_corpus_snapshots.sql`, three test files. Changed `src/types.ts`, `src/answer.ts`, `src/rag/{payload,store,cli}.ts`, `src/server.ts`, the web client and CSS.

**Delivered:** the `headline` field in the answer contract, validated and bound by cite-or-refuse; both corpus dates stored where the container can reach them; the staleness warning on every answer and in speech, compared in UTC; citation completeness asserted at the render layer, including that the browser builds no label itself; card markup and CSS at 40px, 12.10:1 contrast, shipping dormant.

**Not delivered: FR-P2-13.** Filling the headline needs a system-prompt rule. Measured at temperature 0 against an identical index, it moved faithfulness 1.000 to 0.989, bucket A 37/40 to 36/40, and turned A-31 - a pharmacy question D-036 says the corpus cannot answer - from a refusal into an answer. Rewording the rule as display-only did not help. Only removing it did. D-069.

**Then a second finding:** with the rule gone but the field still named in the declared JSON shape, A-22's faithfulness sat at 0.667 instead of 1.0 with retrieval unchanged. Removing the field from the shape returned `src/rag/payload.ts` byte-identical to Stage 2, and the final run reads faithfulness 1.000, bucket A 37/40, refusal 10.0%, router 1.000, four known failures. 479 tests pass.

**What building it surfaced:**

- **A prompt is a budget.** Seven rules became eight and the refusal rule got quieter. Nothing in the new rule mentioned refusing.
- **A disclaimer is not an exemption.** Stating in the rule that it changed nothing about refusals did not stop it changing them.
- **Naming an unused field is not free.** One token in the declared shape moved a faithfulness score.
- **"Corpus ingestion date" is two dates.** Members mean the document fetch; the pipeline only knew the ingest, and incremental ingest makes that one misleading.
- **`getFullYear` is local time**, so a year-boundary check would have moved with the container's timezone.

**Open:** the answer card. The likely route if it is picked up is a second model call over the validated claims only, which cannot change answering behaviour by construction, at one extra call on cost answers. `srs-p2.md` still states FR-P2-13 as a requirement and has not been amended.

**Next:** Stage 4, the session UX cluster.

## 2026-09-08 - P2 Stage 4: session surfaces and the chat panel layout

**Did:** Conversation history, copy, print, help and quick replies. Rebuilt the panel layout so the header and composer stay put.

**Files:** created `web/src/history.ts`, `web/src/copy.ts`, two test files. Changed `web/src/api.ts`, `web/src/app.css`, `web/src/components/Assistant.tsx`, `tests/unit/a11y-static.test.ts`.

**Verified:** `/api/plans` serves three plans and both corpus dates. Web build succeeds. 503 tests pass. The stage's diff is web, tests and ADRs only, so the answer and router metrics cannot have moved.

**What building it surfaced:**

- **FR-13 was broken in the state that matters.** "Talk to a person" must be present in every state. `.panel` scrolled as one column, so it scrolled away as soon as a member read a long answer. The human path now lives in a pinned header.
- **A requirement asking for something that is not a dialog.** FR-P2-23 wants a help panel that is keyboard reachable and does not trap focus. Trapping focus is what makes a dialog a dialog. Built as a disclosure region, which is what the requirement describes.
- **Stage 3's measurement settled Stage 4's biggest question without an experiment.** Contextual follow-up chips would have needed the answering prompt, and D-069 had already priced that.
- **A restored turn can break cite-or-refuse.** Storage holding claims without their citations would redraw claims with nothing behind them after a reload. Such a turn is dropped on read.
- **`min-height: 0`** is what lets a grid row shrink below its content; without it the "scrolling" region simply grows and the panel scrolls as before.
- **A DOM module imported by a test drags the DOM into the Node project.** `history.ts` reaches storage through `globalThis` rather than `window` so it compiles under both tsconfigs.

**Open:** contextual follow-up chips are not built. History surviving a real browser reload, and the printed page's appearance, are asserted at the storage and stylesheet layers but not rendered in a browser - still the deferred component-harness decision.

**Next:** Stage 5, synthetic member records. `claude/srs-p2.md` FR-P2-24 to FR-P2-29.

## 2026-09-08 - Interface pass on the assistant panel

**Did:** Thirteen interface changes requested by the user. Seven direct, six taken to decision, three of which conflicted with an existing guarantee.

**Files:** created `web/src/progress.ts`. Changed `web/src/App.tsx`, `web/src/components/Assistant.tsx`, `web/src/app.css`, `tests/unit/a11y-static.test.ts`. Added `framer-motion@13.2.0`.

**Verified:** 520 tests pass, both typecheck projects clean, build succeeds. Bundle 78KB to 119KB gzipped, all of it Framer Motion.

**What the pass surfaced:**

- **A focus ring cannot be keyboard-only on a text field.** `:focus-visible` matches on mouse click too, by design, because a text field must show where typing lands. The request was met by drawing the indicator inside the radius rather than outside it, which is what made it ugly.
- **A backdrop obliges a focus loop.** Once the page is dimmed and locked, a keyboard user tabbing out lands on controls they cannot see. Adding the backdrop without the loop would have made the panel a dialog for mouse users only.
- **Voice mode's scroll problem was a layout bug, not a scroll lock.** The voice stage sat in the pinned foot at full height and left the thread a sliver, so an answer could be heard but not read. Capping the stage fixed it.
- **Two `prefers-reduced-motion` blocks are worse than one.** Appending a second made the first unreachable to a test reading the last occurrence, and would equally confuse the next person editing it.
- **Reformatting breaks whitespace-exact assertions.** Four tests failed on wrapped strings rather than changed behaviour. They normalise whitespace now; a test that fails when a formatter runs is testing the formatter.
- **Three requests conflicted with a requirement and were resolved in the open** rather than quietly reinterpreted: the focus ring, the modal's focus behaviour, and chip sizing against the 44px target minimum.

**Open:** Framer Motion's 41KB is a real cost for this audience and is not measured on a throttled connection. `eval/results/real-device-latency.md` is still the empty template it has been since P1.

**Next:** Stage 5, synthetic member records.
