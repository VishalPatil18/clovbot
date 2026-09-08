# Build Plan - P1 (v1)

> Source: `claude/srs.md` v1.0.0 (frozen). Scope is P1 only - the 30 functional and 19 non-functional requirements in that document.
>
> Every stage ends in something runnable and testable. No stage delivers "the schema exists."
>
> **Effort bands for this project** (hours, not days): **S** ≤ 3h · **M** 4-8h · **L** 9-14h.

| Field | Value |
| --- | --- |
| Plan version | 1.0.0 |
| Source | `claude/srs.md` v1.0.0 |
| Last Updated | 2026-09-07 |
| Total estimate | ~61h across 10 stages |

---

## Stage Map

| # | Stage | Deliverable | Effort | Cumulative |
| --- | --- | --- | --- | --- |
| 1 | Corpus spike | Real Clover documents fetched and converted, with a retrievability report | S | ~3h |
| 2 | Voice latency spike | Measured numbers against all four latency budgets, before anything depends on them | S | ~6h |
| 3 | Thinnest end-to-end answer | Cited answer at a terminal from one document. **First demoable artifact.** | M | ~12h |
| 4 | Full ingest + hybrid retrieval | Whole corpus, contextual chunks, idempotent snapshots, RRF fusion | M | ~19h |
| 5 | Golden set + eval harness | 50 hand-pinned questions and four scored metrics, failing in CI | M | ~25h |
| 6 | Rerank, floor, cite-or-refuse | The answer contract, driven by Stage 5's failing tests | M | ~31h |
| 7 | Chat surface + accessibility | The member-facing product, WCAG 2.2 AA | L | ~43h |
| 8 | Guardrails + escalation | Bucket C refusals, loop breaker, failure states, callback | M | ~50h |
| 9 | Voice integration | Full voice loop against the Stage 2 measurements | M | ~58h |
| 10 | Deploy + release verification | Live, instrumented, eval green, measured on a real device | S | ~61h |

**Ordering logic.** Stages 1 and 2 are spikes. They are deliberately not product, because they are the two things that must fail early if they are going to fail at all. The demoable-at-any-stop guarantee begins at Stage 3, around hour 12. Stage 5 precedes Stage 6 so that the answer contract is implemented against tests that already exist and already fail.

---

## Stage 1 - Corpus spike

- **Goal:** Find out whether Clover's public plan documents can actually be retrieved and converted to usable text, before anything is built on the assumption that they can.
- **Scope in:**
  - A single command that fetches the 2026 Clover PPO document set for one service area: Evidence of Coverage, Summary of Benefits, formulary, provider directory, pharmacy directory, OTC and supplemental benefit pages.
  - PDF and HTML to markdown conversion.
  - A manifest recording source URL, retrieval timestamp, byte count, page count, and conversion status per document.
  - A written retrievability report naming anything that could not be fetched or converted, and why.
  - `robots.txt` compliance recorded in the manifest.
- **Scope out:** Chunking, embedding, storage, retrieval. Stage 3 and Stage 4 own those. No plan-year enforcement yet - Stage 4 owns that.
- **Acceptance criteria:**
  - [ ] `npm run corpus:fetch` completes and exits zero.
  - [ ] The manifest lists one entry per attempted document with a status of `ok` or `failed`, never blank.
  - [ ] Every document marked `ok` has a non-empty markdown file with a byte count above a floor that would catch a silent empty conversion.
  - [ ] The Summary of Benefits markdown contains at least one recognisable cost-sharing amount, asserted by test, proving tables survived conversion.
  - [ ] The formulary markdown contains at least one recognisable drug name and tier, asserted by test.
  - [ ] The retrievability report names every failure with a reason.
  - [ ] The chosen service area is recorded, resolving the open question in `srs.md` §10.
- **Test plan:** Integration test runs the fetch against fixtures captured from the live site so it is repeatable offline. Assertions target the two content-survival checks above, which are the ones that catch a conversion that "succeeded" and produced garbage. One manual read of the Summary of Benefits markdown against the source PDF.
- **Effort:** S
- **Exit signal:** You can open the converted Summary of Benefits and read a copay amount that matches the PDF.
- **Status:** [ ] not started · [ ] in progress · [ ] done

**If this stage fails,** the product changes shape at hour 3, not hour 34. A corpus that will not convert cleanly means either a different document source, manual extraction of a narrower set, or a scope change - all of which are cheap decisions now and catastrophic ones later.

---

## Stage 2 - Voice latency spike

- **Goal:** Measure whether the four latency budgets in NFR-PERF-01 through 04 are achievable with the chosen providers, before any product depends on them.
- **Scope in:**
  - A standalone throwaway page: microphone capture, streaming to ElevenLabs Scribe v2 Realtime over WebSocket, transcript to Azure OpenAI gpt-4o, streamed response to ElevenLabs Flash v2.5.
  - Hardcoded prompt. No retrieval, no corpus, no product UI.
  - Instrumentation printing time to first partial transcript, time to first token, time to first audio, and time to complete spoken answer.
  - Measurement under 4x CPU slowdown and Slow 4G, per NFR-PERF-05.
  - A record of credits consumed by the run, answering the free-tier question in `srs.md` §10.
- **Scope out:** Voice mode UI, provider fallback chain, TTS caching, editable transcripts. Stage 9 owns all of it.
- **Acceptance criteria:**
  - [ ] The page completes a full speak-to-hear loop end to end.
  - [ ] All four timings are printed and written to a results file.
  - [ ] Each timing is compared against its NFR threshold with an explicit pass or fail.
  - [ ] The run is repeated at least five times and p95 is reported, not a single best-case number.
  - [ ] Credits consumed per loop are recorded, and the number of demo loops the free tier supports is calculated.
  - [ ] Any budget that fails is written up with the measured number and a proposed revision.
- **Test plan:** Manual, scripted, repeated. This is a measurement harness rather than a unit-tested component. The results file is the artifact and is committed, so the numbers can be cited later rather than remembered.
- **Effort:** S
- **Exit signal:** A committed results file stating, with real numbers, whether time to first audio under 1.5s is achievable.
- **Status:** [ ] not started · [ ] in progress · [ ] done

**If this stage fails,** the budgets get renegotiated at hour 6 while voice is still a plan, rather than at hour 50 when it is half-built. A failed time-to-first-audio measurement is an SRS amendment, not a crisis.

---

## Stage 3 - Thinnest end-to-end answer

- **Goal:** Get one real question answered from one real document with a real citation, through the whole path, as fast as possible.
- **Scope in:**
  - Supabase project with pgvector, one table, HNSW index.
  - Naive chunking of the Summary of Benefits only.
  - Azure `text-embedding-3-small` embedding at ingest and at query time.
  - Vector-only retrieval, top-k, no fusion and no reranking.
  - Generation with Azure gpt-4o, prompted to cite the chunk it used.
  - A CLI entry point: question in, cited answer out.
  - Turn logging with chunk ids, per FR-26, written from the first turn rather than retrofitted.
- **Scope out:** Hybrid retrieval, contextual chunk prefixes, reranking, confidence floor, refusal behaviour, web UI, voice. Stages 4 through 9 own them.
- **Acceptance criteria:**
  - [ ] `npm run ask "what is the specialist copay"` returns an answer containing the correct amount.
  - [ ] The answer names the source document and section.
  - [ ] The returned amount is verified by hand against the source PDF and the verification recorded.
  - [ ] A turn log row is written containing question, chunk ids, and corpus snapshot id.
  - [ ] Given a question with no relevant content in the single indexed document, the system returns something other than a fabricated amount.
  - [ ] Re-running the same question returns the same chunk ids.
- **Test plan:** Integration test against a seeded database with a fixed three-question set whose answers were hand-verified. Assert the amount appears, assert a citation exists, assert the turn log row is written with non-empty chunk ids. The no-content case asserts absence of a dollar figure in the output.
- **Effort:** M
- **Exit signal:** You can type a question at a terminal and read back a correct, cited copay.
- **Status:** [ ] not started · [ ] in progress · [ ] done

**This is the first demoable artifact.** From here, every subsequent stage leaves the system in a state you could show someone.

---

## Stage 4 - Full ingest and hybrid retrieval

- **Goal:** Turn the Stage 3 prototype into the real pipeline: whole corpus, contextual chunks, reproducible snapshots, hybrid retrieval.
- **Scope in:**
  - Header-aware chunking across all document types.
  - Contextual chunk prefixes per D-006: a short generated blurb prepended before embedding and lexical indexing.
  - Plan-year enforcement at ingest per FR-01 - out-of-year documents rejected, not filtered later.
  - Idempotent ingest producing an immutable, identified corpus snapshot.
  - `tsvector` column with a GIN index alongside the existing HNSW index.
  - Reciprocal rank fusion across dense and lexical results, implemented as a single Postgres function.
  - Chunk provenance per FR-04: document, plan year, contract id, section, snapshot id.
- **Scope out:** Reranking and the confidence floor. Stage 6 owns them. Structured lookup and routing are deferred to P2 per the D-007 decision.
- **Acceptance criteria:**
  - [ ] `npm run ingest` runs the entire pipeline from one command.
  - [ ] Running `ingest` twice with unchanged sources creates no duplicate chunks and leaves the snapshot id unchanged.
  - [ ] A 2025 document offered to the pipeline is rejected, and no 2025 chunk exists in the index afterward.
  - [ ] Every chunk row has non-null document, plan year, contract id and section.
  - [ ] A chunk with no header context still carries a contextual prefix naming its benefit or section.
  - [ ] The fusion function returns results for an exact-token query (a drug name) that vector-only search ranks below top-k, demonstrated on a named example.
  - [ ] The fusion function returns results for a paraphrased query that lexical-only search misses, demonstrated on a named example.
  - [ ] A ten-question smoke set retrieves the correct source document for at least eight.
- **Test plan:** Unit tests on the chunker for header handling and prefix generation. Integration test running ingest twice and asserting snapshot stability and no duplication. Integration test on the rejection path. Two named retrieval cases asserting the hybrid result beats each single-mode baseline - these are the tests that prove D-004 was worth its complexity.
- **Effort:** M
- **Exit signal:** One command rebuilds the whole corpus reproducibly, and a drug-name query retrieves the right formulary row.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 5 - Golden set and eval harness

- **Goal:** Build the tests that Stage 6 will be implemented against. This stage exists before the answer contract so the acceptance criteria are failing tests, not retrospective validation.
- **Scope in:**
  - 50 golden questions drafted from the `docs/call-drivers.md` bucket A taxonomy.
  - Expected answers pinned by hand to a specific document page or section, per D-017.
  - Correct-refusal cases covering all ten bucket C triggers.
  - At least one prompt-injection case built from a hostile chunk.
  - Faithfulness judge: sentence-level entailment against cited chunks.
  - Structural citation check: deterministic assertion that every factual sentence carries a citation marker.
  - Refusal-rate calculation with the NFR-QUAL-03 bands.
  - Per-bucket accuracy breakdown.
  - CI wiring that fails the build on threshold breach.
- **Scope out:** Fixing anything the harness reports. Stage 6 does that. The harness is expected to fail on first run.
- **Acceptance criteria:**
  - [ ] The golden set contains 50 questions, each with a recorded source page or section.
  - [ ] Every bucket C trigger has at least one case.
  - [ ] At least one case is a prompt-injection attempt.
  - [ ] `npm run eval` produces faithfulness, structural compliance, refusal rate, and per-bucket accuracy.
  - [ ] The structural check fails on a deliberately uncited answer fixture.
  - [ ] The faithfulness judge scores a deliberately unfaithful answer fixture below 0.5.
  - [ ] A hand-checked sample of at least 10 judge scores is recorded, calibrating the judge per NFR-QUAL-01.
  - [ ] CI fails when faithfulness is below 0.90 or refusal rate is above 35%.
  - [ ] The harness runs against the Stage 4 system and reports real numbers, whatever they are.
- **Test plan:** The harness is itself tested with fixtures - one known-good answer, one uncited answer, one unfaithful answer, one correct refusal. Those four fixtures prove the harness detects what it claims to detect, which is the failure mode that would otherwise make every later number meaningless.
- **Effort:** M
- **Exit signal:** `npm run eval` prints four real numbers and CI goes red on the ones that are not yet met.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 6 - Reranking, confidence floor, cite-or-refuse

- **Goal:** Implement the answer contract until Stage 5's harness goes green.
- **Scope in:**
  - Reranker selection, resolving the load-bearing open question. Spike two candidates against the golden set and pick on measured accuracy, not on preference.
  - Confidence floor comparison on the top reranked score, per FR-03 and D-016.
  - Per-claim cite-or-refuse generation, per FR-05 and D-015: supported claims cited, unsupported parts named explicitly.
  - Citation rendering with document, plan year, contract id and section, per FR-06. A citation missing a plan year is invalid.
  - EOC precedence on source conflict, with the conflict stated, per FR-07 and D-020.
  - Zero-retrieval refusal, per FR-09 and D-021 - no parametric fallback under any circumstance.
  - Token streaming, per FR-08.
  - Reranker score and floor recorded on every turn.
- **Scope out:** Bucket C guardrails and escalation UI. Stage 8 owns those. This stage covers only the retrieval-confidence path to refusal.
- **Acceptance criteria:**
  - [ ] Faithfulness on the golden set is at or above 0.90.
  - [ ] Structural citation check passes with zero uncited factual sentences.
  - [ ] Refusal rate is below 20%, or above it with a written corpus-gap analysis rather than a lowered floor.
  - [ ] A question whose top reranked score is below the floor produces a refusal and no factual claim.
  - [ ] A partially-covered question answers the supported part and names the unsupported part explicitly.
  - [ ] A question answered from conflicting EOC and Summary of Benefits chunks returns the EOC value and states the conflict.
  - [ ] With the datastore unreachable, no factual claim about plan benefits appears in the output.
  - [ ] A citation missing plan year provenance causes a refusal rather than an uncited answer.
  - [ ] The reranker comparison is written up with the measured numbers behind the choice.
- **Test plan:** Stage 5's harness is the primary gate. Additional integration tests force each named edge: below-floor, partial coverage, source conflict, datastore down, missing provenance. The datastore-down test is the most important one in the plan - it is the only failure that looks like success.
- **Effort:** M
- **Exit signal:** `npm run eval` is green, and killing the database connection produces a refusal rather than a confident answer.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 7 - Chat surface and accessibility

- **Goal:** Put the working answer path behind a member-facing interface that meets the accessibility floor.
- **Scope in:**
  - Clover-styled host page with the unaffiliated-case-study disclaimer.
  - Launcher at bottom right; panel at 40% viewport width; full-page route; full width on mobile.
  - Streaming answer rendering with citations.
  - Four to six suggested starter questions from the highest-volume bucket A drivers, per FR-14.
  - Lazy plan-context prompting, per FR-10 and D-022: free asking, prompt only when a question needs plan scope, retained for the session.
  - Scope disclosure surface, per FR-15.
  - "Talk to a person" visible in every state including during generation, per FR-13.
  - Full accessibility pass: NFR-A11Y-01 through 05.
- **Scope out:** Escalation behaviour behind the button - Stage 8 owns the callback form. Voice mode - Stage 9. Answer card formatting - deferred to P2.
- **Acceptance criteria:**
  - [ ] Automated accessibility scan reports zero violations on the panel, the full-page route and the host page.
  - [ ] Every function is reachable and operable by keyboard alone, in visual order, with no trap.
  - [ ] Focus indication is at least 2px at 3:1 contrast on every focusable element.
  - [ ] All interactive targets measure at least 44x44 CSS px.
  - [ ] Body text is at least 18px and the layout reflows without horizontal scroll at 200% zoom.
  - [ ] No interaction requires hover; no hamburger appears in primary navigation.
  - [ ] "Talk to a person" is present and operable while an answer is mid-stream, asserted by test.
  - [ ] A plan-scoped question with no plan context set prompts for plan and produces no amount before the member answers.
  - [ ] A non-plan-scoped question is answered without prompting.
  - [ ] Retrieval p95 under 300ms and time to first token under 800ms, measured under the NFR-PERF-05 throttled profile in CI.
  - [ ] Screen-reader pass on one full question-and-answer flow, recorded.
- **Test plan:** Automated axe scan in CI on three routes. Keyboard-only integration test walking a complete flow. Target-size and contrast assertions from computed styles. Two plan-context integration tests, one each side of the boundary. Lighthouse throttled run in CI gating the two latency numbers. One manual screen-reader pass, because automated scans do not catch a nonsensical reading order.
- **Effort:** L
- **Exit signal:** You can drive a complete question and cited answer using only the keyboard, at 200% zoom, with no accessibility violations.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 8 - Guardrails and escalation

- **Goal:** Make every failure path a designed surface rather than an error, and enforce the regulatory boundary.
- **Scope in:**
  - All ten bucket C triggers from `docs/call-drivers.md` §6, per FR-21.
  - Refusals that state the boundary and show what was found, per FR-22.
  - Callback form pre-filled with question, plan context and documents searched.
  - Placeholder phone number with the D-026 note, permanently visible.
  - Loop breaker after two consecutive refusals, per FR-23.
  - Non-English detection and English refusal with the human path, per FR-24.
  - Upstream failure states for model and datastore unavailability, logged as `upstream_failure` and excluded from refusal rate, per FR-25.
  - Per-session and per-IP rate limiting, per FR-30 and NFR-SEC-02.
  - Retrieved content fenced as untrusted data, never as instructions, per NFR-SEC-04.
- **Scope out:** Real callback delivery. The form validates, stores and confirms; no message is sent anywhere.
- **Acceptance criteria:**
  - [ ] Each of the ten bucket C triggers produces a refusal, asserted by ten tests.
  - [ ] "Was my denial correct" refuses; "how do I appeal a denial" answers with a citation. Both asserted, as the pair is one word apart.
  - [ ] A clinical question produces no clinical guidance and no hedged partial advice.
  - [ ] A plan-selection question refuses and does not compare plans.
  - [ ] A chunk containing injected instructions does not change citation behaviour, asserted against the Stage 5 injection fixture.
  - [ ] Two consecutive refusals cause the third turn to present the callback form directly.
  - [ ] The callback form is pre-filled with question, plan context and documents searched.
  - [ ] A Spanish question returns an English refusal and the human path, with no attempted answer.
  - [ ] A forced model-provider error produces the upstream failure state, and the turn logs as `upstream_failure`.
  - [ ] The refusal-rate metric excludes upstream failures, asserted directly.
  - [ ] Exceeding the rate limit returns a clear message rather than a stack trace or a hang.
- **Test plan:** One integration test per bucket C trigger, driven from the Stage 5 refusal cases so the harness and the product share a single definition. The A-11 versus C-01 pair gets its own paired test. Fault injection for the upstream failure and rate-limit paths. The injection test reuses the Stage 5 hostile fixture rather than defining a second one.
- **Effort:** M
- **Exit signal:** Every bucket C question refuses correctly, and forcing a provider outage produces an honest error rather than a wrong answer.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 9 - Voice integration

- **Goal:** Build the full voice loop against the measurements taken in Stage 2, rather than against assumptions.
- **Scope in:**
  - Mode toggle between text and voice, persisted, per FR-16.
  - Centred microphone control with idle, listening and processing states.
  - Both press-and-hold and tap-to-start / tap-to-stop, both always available, per FR-17.
  - Live partial transcript during speech; completed transcript editable before send, per FR-18.
  - Simultaneous spoken and written answers with stop and replay, per FR-19.
  - Provider chain for speech-to-text and text-to-speech terminating in the native browser synthesiser, per FR-20.
  - TTS audio cache keyed on answer text.
  - Degrade notice when the chain falls through.
- **Scope out:** Circuit breaker with health checks, per comment C-3 - not in the SRS, deferred. Fish Audio's current tier status is a Stage 2 finding and may change the chain.
- **Acceptance criteria:**
  - [ ] A complete question and answer can be conducted by voice alone.
  - [ ] Partial transcript renders while speech is in progress.
  - [ ] The completed transcript is editable and the edited text is what gets sent, asserted by test.
  - [ ] Both hold and tap paths produce an identical sent transcript for identical audio.
  - [ ] Every spoken answer also renders as text, asserted by test.
  - [ ] Forcing primary provider failure falls through to the next provider and the member is told the voice changed.
  - [ ] Forcing all remote providers to fail still produces spoken output via the native synthesiser.
  - [ ] A repeated answer is served from the audio cache without a second synthesis call.
  - [ ] Time to first audio under 1.5s and complete spoken answer under 4s, under the throttled profile.
  - [ ] Mode choice survives a page reload.
- **Test plan:** Integration tests with mocked provider responses for the chain and the cache. Fault injection at each chain level, including the all-fail case, which is the one that proves the chain terminates somewhere safe. The two latency numbers gate in CI under the same throttled profile as Stage 7. One manual pass speaking a real question on a real device.
- **Effort:** M
- **Exit signal:** You can ask a benefits question out loud, hear a cited answer, read the same answer on screen, and the latency numbers hold.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 10 - Deploy and release verification

- **Goal:** Ship it, prove it, and make any past answer reproducible.
- **Scope in:**
  - Vercel and Supabase deployment from a seed script.
  - Documented `.env.example` with no credentials in the repository, per NFR-SEC-03.
  - Unaffiliated-case-study disclaimer visible on the deployed site.
  - Rate limits active in production.
  - Instrumentation view: containment, refusal reasons, top unanswered questions, per FR-26 and FR-27.
  - Answer reproduction: given a turn id, reconstruct the retrieved context from the recorded chunk ids and snapshot id, per NFR-OPS-02.
  - Full eval run against the deployed system.
  - Manual latency pass on a real mid-range Android, per NFR-PERF-05.
- **Scope out:** Nothing deferred. This stage closes v1.
- **Acceptance criteria:**
  - [ ] The deployed URL answers a benefits question with a citation.
  - [ ] A fresh clone plus `.env.example` plus documented steps reproduces the environment.
  - [ ] No credential, key or endpoint appears anywhere in the repository, asserted by a secret scan in CI.
  - [ ] The disclaimer is visible on every page.
  - [ ] Rate limits are active and return a clear message when exceeded.
  - [ ] Given a turn id, the reproduction command reconstructs the identical retrieved context.
  - [ ] The instrumentation view lists the top unanswered questions from real usage.
  - [ ] Full eval passes against the deployed system, not just locally.
  - [ ] All four latency budgets measured on a real device, with numbers recorded even where they differ from CI.
  - [ ] The "Did this answer your question?" control records responses.
- **Test plan:** Smoke test against the deployed URL in CI. Secret scan as a hard gate. A reproduction test that takes a real turn id from the deployed log and asserts identical chunk reconstruction. Manual real-device pass with numbers written down and committed alongside the Stage 2 results file for comparison.
- **Exit signal:** A shareable URL answers a cited question, and any answer it has ever given can be reconstructed from its log.
- **Effort:** S
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Completion Checklist

- [ ] Stage 1 - Corpus spike
- [ ] Stage 2 - Voice latency spike
- [ ] Stage 3 - Thinnest end-to-end answer
- [ ] Stage 4 - Full ingest and hybrid retrieval
- [ ] Stage 5 - Golden set and eval harness
- [ ] Stage 6 - Reranking, confidence floor, cite-or-refuse
- [ ] Stage 7 - Chat surface and accessibility
- [ ] Stage 8 - Guardrails and escalation
- [ ] Stage 9 - Voice integration
- [ ] Stage 10 - Deploy and release verification

---

## Cross-Cutting Risks

| Risk | Impact | Mitigated by | Residual |
| --- | --- | --- | --- |
| Clover documents are not retrievable or convert badly | Fatal. No corpus, no product. | Stage 1, deliberately first | If conversion is partial, the corpus narrows and the refusal rate rises. Detected at hour 3. |
| Voice latency budgets are unachievable | Voice becomes a liability rather than a feature | Stage 2, measured before anything depends on it | Budgets get renegotiated by SRS amendment rather than quietly missed |
| No free reranker exists under the zero-cost constraint | FR-03's confidence signal has no implementation | Stage 6 spikes two candidates and picks on measured accuracy | Falls back to raw similarity, which requirements rejected; would need an ADR |
| Parametric fallback on retrieval failure | Silent, total violation of the citation contract while appearing to work | Stage 6 acceptance criterion, tested directly with the datastore down | The single most important test in this plan |
| Prompt injection through corpus content | Citation rules bypassed | Stage 5 hostile fixture, Stage 8 assertion, NFR-SEC-04 fencing | Larger threat in P4 when uploads open the corpus |
| A-11 versus C-01 misclassification | Regulatory. Explaining appeals versus evaluating a denial are one word apart | Paired test in Stage 8, both directions in the golden set | Highest-consequence classifier error in the build |
| ElevenLabs free tier exhausts during the demonstration | Voice fails live | Stage 2 measures credits per loop; Stage 9 caches audio and terminates the chain at the native synthesiser | The native tier cannot be exhausted, so voice degrades rather than breaking |
| Refusal rate above 20% from a thin corpus | Product looks unhelpful | Stage 6 requires a corpus-gap analysis rather than a lowered floor, per NFR-QUAL-03 | Prohibition on lowering the floor is what keeps this honest |
| Eval judge is itself wrong | Every quality number becomes meaningless | Stage 5 calibrates against a hand-checked sample and tests the harness with four fixtures | Judge error is bounded but not eliminated |
| Accessibility retrofitted rather than built in | Expensive rework, or a floor that is quietly missed | Stage 7 gates it in CI rather than checking at the end | Automated scans miss reading-order problems; one manual pass covers it |
