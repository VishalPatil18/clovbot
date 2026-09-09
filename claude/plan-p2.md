# Build Plan - P2 (v1.1)

> Scope: the v1.1 items listed as explicit non-goals in `claude/srs.md` §8, plus D-007 (deterministic tools), deferred here from P1 by decision.
>
> **Depends on plan-p1 Stage 10.** Every stage here assumes a deployed, evaluated v1.
>
> **This plan has no frozen SRS behind it.** `claude/srs.md` v1.0.0 covers P1 only. Before Stage 5 begins, the authenticated tier needs its own requirements pass - the login-required classifier and the member-data boundary are not specifiable from `docs/ideas.md` alone.
>
> **Effort bands:** **S** ≤ 3h · **M** 4-8h · **L** 9-14h.

| Field | Value |
| --- | --- |
| Plan version | 1.0.0 |
| Source | `claude/srs.md` §8, `docs/ideas.md` P2, D-007 |
| Last Updated | 2026-09-07 |
| Total estimate | ~48h across 8 stages |

---

## Stage Map

| # | Stage | Deliverable | Effort | Cumulative |
| --- | --- | --- | --- | --- |
| 1 | Second plan indexed | The same question returns different copays for two plans | M | ~7h |
| 2 | Structured lookup and router | Provider and formulary queries hit typed data, not prose | L | ~18h |
| 3 | Answer card and freshness | Amount-forward answer format, plan year on every citation | M | ~24h |
| 4 | Session UX cluster | History, export and print, quick replies, help panel | M | ~31h |
| 5 | Synthetic member records | Member questions answered at a terminal, no auth yet | M | ~37h |
| 6 | Email OTP authentication | Inline login inside the panel, session bound to a member | M | ~43h |
| 7 | Login detection and member answering | The full authenticated loop, both classifier directions tested | M | ~48h |
| 8 | Auth-tier eval and deploy | Extended golden set, shipped | S | ~51h |

**Ordering logic.** Stages 1 through 4 improve the public product and each ships independently, so a stop anywhere leaves v1 strictly better. Stage 2 sits early because D-007's router is the highest-uncertainty item in P2 and follows the same front-load-the-risk rule as P1. The authenticated tier is stages 5 through 8 and is the only sequence with hard internal dependencies.

---

## Stage 1 - Second plan indexed

- **Goal:** Prove the plan selector is load-bearing rather than ornamental by making the same question return different answers.
- **Scope in:** Ingest a second plan benefit package - the HMO contract or a second PPO service area. Plan-scoped retrieval filtering. Plan switcher in the interface. Golden set extended with paired questions that differ only by plan.
- **Scope out:** Full eleven-state expansion. That is P4.
- **Acceptance criteria:**
  - [x] Both plans are indexed with distinct contract identifiers. H5141-004, H5141-007 and H8010-002.
  - [x] The same question asked under each plan returns different, individually correct amounts, hand-verified against both source documents. $6,000 against $9,250.
  - [x] Retrieval never returns a chunk from a plan other than the one in session context, asserted directly. `scripts/plan-scope-check.ts`, 300 rows, 0 leaks, and shown capable of failing.
  - [~] Switching plans mid-session re-scopes subsequent answers and does not retroactively alter prior ones. Built and read; not covered by an automated test, because no component harness exists.
  - [x] The golden set contains at least five paired cross-plan questions. Five pairs, four numeric and one structural.
- **Test plan:** Paired integration tests per question, asserting both correctness and difference. A negative test asserting cross-plan leakage never occurs - this is the one that matters, because leakage produces a confidently wrong copay.
- **Effort:** M
- **Exit signal:** Asking the same copay question under two plans returns two different correct numbers.
- **Status:** [x] done, 2026-09-08. Effort ran 22.5h against the M band's ~7h; the overrun is D-049, D-053, D-056 and D-057, all decided after this plan was written.

---

## Stage 2 - Structured lookup and router

- **Goal:** Implement D-007 - typed queries for facts that live in tables, RAG for rules and prose.
- **Scope in:** Structured ingest of the provider directory and formulary into typed tables. Typed query functions for provider search and formulary tier lookup. A router selecting between structured lookup and RAG. Router decisions logged on every turn.
- **Scope out:** Structured ingest of anything else. Cost-sharing tables stay in RAG for now.
- **Acceptance criteria:**
  - [-] Provider search returns exact matches from typed data. **Not built, by decision (D-051):** the directory is ten invented rows, so exact search over it would produce a confident wrong answer about a member's own doctor. Provider questions keep the v1 refuse-and-route behaviour.
  - [x] Formulary tier lookup for a named drug returns the tier from a table row, with the row cited. `Drug List 2026 · atorvastatin calcium`, Tier 1.
  - [x] The router logs its selection and reasoning on every turn. `turns.route` and `turns.route_reason`.
  - [x] A held-out set of 30 routing cases achieves at least 90% correct selection. 32 cases, 1.000.
  - [x] Misrouting a tier question to RAG is detected by test. Counted separately and gated at zero, not folded into the aggregate.
  - [x] A question that is genuinely both is handled without dropping either half. Verified live on "is eliquis covered and how do I appeal a denial".
  - [x] Structured answers carry citations in the same format as RAG answers. A row is projected into the retrieved-chunk shape, so it travels the same path.
- **Test plan:** A 30-case routing set with hand-labelled expected paths, run as a classification test with a reported confusion matrix. Separate correctness tests per path. The both-halves case is its own test.
- **Effort:** L
- **Exit signal:** A drug tier question returns a table row, a rules question returns prose, and the router's confusion matrix is on record.
- **Status:** [x] done, 2026-09-08. Provider search deliberately not delivered (D-051); everything else met.

**Highest-uncertainty stage in P2.** D-007's rationale is strong on the split and silent on the routing, per comment T-3. Failing here early is the point of its position in the order.

---

## Stage 3 - Answer card and freshness

- **Goal:** Stop presenting benefits answers as chat prose.
- **Reference:** the bot message block in `design/mock/Chatbot Page.dc.html`. Note its citation chip is set at 11px, the smallest type on the screen, on the surface the product's trustworthiness rests on. See `design/mock/README.md` conflict 1.
- **Scope in:** Answer card format - one-sentence direct answer, the amount in large type, source line beneath. Plan year and document version on every citation. Corpus ingestion date recorded and surfaced. Stale-document warning when the plan year rolls over.
- **Scope out:** Appearance customization. That is P4.
- **Acceptance criteria:**
  - [-] A cost answer renders the amount as the visually dominant element. **Not delivered (D-069):** filling the headline needs a system-prompt rule, and that rule measurably weakened the refusal rule - a pharmacy question D-036 says the corpus cannot answer began answering, and faithfulness fell to 0.989. Card markup and CSS ship dormant.
  - [x] Every citation displays document, plan year and section. Already true since Stage 6; now asserted at the render layer too.
  - [x] A citation missing a plan year fails rendering rather than displaying incomplete, asserted by test. Also asserted that the browser builds no label itself.
  - [x] The corpus ingestion date is visible from the interface. Both dates recorded; the document date is served on `/api/plans`.
  - [x] With the system clock advanced past a plan-year boundary, a staleness warning appears. Clock is a parameter, compared in UTC.
  - [x] Card format degrades to readable prose when the answer is not a single amount. The degradation path is the shipped path.
  - [x] Accessibility scan stays clean on the new format, and the large amount still meets contrast requirements. 12.10:1, computed.
- **Test plan:** Snapshot tests on three answer shapes - single amount, multi-part, prose-only. Clock-manipulation test for staleness. Accessibility regression scan.
- **Effort:** M
- **Exit signal:** A copay answer reads as a card with the number prominent and its plan year visible.
- **Status:** [~] partial, 2026-09-08. Freshness, staleness and citation completeness delivered. The card is built but never populated: D-069 records the measurement that stopped it.

---

## Stage 4 - Session UX cluster

- **Goal:** The retention and sharing surfaces, grouped because they share state and ship together cleanly.
- **Reference:** the sidebar in `design/mock/Chatbot Page.dc.html` already draws "Recent" and "Search conversations." Both belong to this stage, not to P1 Stage 7. Search across conversations is drawn but unspecified - decide whether it is in scope. See `design/mock/README.md` conflict 5.
- **Scope in:** Conversation history persisted locally, restored on return, clearable. Export, print stylesheet, and copy or email of an answer or transcript. Quick-reply chips and basic commands. Static help panel listing what can be asked.
- **Scope out:** Server-side history. Without auth there is no identity to key it to.
- **Acceptance criteria:**
  - [x] History survives a page reload and a browser restart. Restored on mount, written on every settled turn. Storage layer tested; the browser reload itself is not, for want of a component harness.
  - [x] Clearing history removes it from storage, verified by inspection rather than by the interface reporting success. The test asserts the key is absent.
  - [x] Print output renders the transcript legibly with citations intact and no interface chrome. Chrome dropped, the scroll region released, citations kept and page-break protected.
  - [x] Export produces a file containing the answers and their citations. Browser print-to-PDF is the export path, decided in Stage 1's requirements pass.
  - [x] Quick-reply chips meet the 44x44 target requirement. Asserted, as are the icon-only close and help controls.
  - [x] The help panel is reachable by keyboard and does not trap focus. Built as a disclosure region rather than a dialog, since a dialog traps focus by definition (D-071).
  - [x] History is absent when storage is unavailable, with no crash and no error surfaced to the member.
  - [-] Quick-reply chips include contextual follow-ups. **Not delivered (D-070):** generating them needs the answering prompt, and D-069 measured that cost. The three commands ship; P2-01 returns to unbuilt.
- **Test plan:** Persistence integration tests across reload. Print stylesheet snapshot. Storage-unavailable test simulating a private window, since that path silently breaks in most implementations.
- **Effort:** M
- **Exit signal:** You can close the tab, return, see your prior conversation, and print it with citations intact.
- **Status:** [x] done, 2026-09-08, minus contextual follow-up chips (D-070). Also fixed the panel layout: header and composer are pinned and the close control is an X at the top right (D-073).

---

## Stage 5 - Synthetic member records

- **Goal:** Make member-specific questions answerable at a terminal, before any authentication exists.
- **Scope in:** Schema and seed for five synthetic members: enrollment, benefit accumulators, past appointments, assigned providers, at least one claim and one prior authorization each. Member-scoped query functions. A CLI taking a member id and a question. Records labelled synthetic in schema and seed.
- **Scope out:** Authentication, sessions, login detection. Stages 6 and 7. Row-level security is P3.
- **Acceptance criteria:**
  - [x] `npm run ask:member -- --id=<n> "..."` returns a correct answer from that member's record. Verified for a claim and a prior authorisation.
  - [x] Answers cite the record and field, not a document. `Your member record · Claim CLM-0031 · What you owe`.
  - [x] A combined question returns both a plan-document citation and a record citation, each attributed to its own source. Verified live: one answer citing the record and four plan documents.
  - [x] Querying member 1 never returns data belonging to member 2, asserted directly. `scripts/member-scope-check.ts`, 5 records, 0 leaks, and shown capable of failing.
  - [x] Every seeded record is deep enough to answer at least four distinct question types. Claim, prior authorisation, allowances and assigned provider, asserted per member.
  - [x] The synthetic label is present in the schema and visible in any output. A check constraint refuses a non-synthetic row, and every fact carries the label in its text.
- **Test plan:** Per-member integration tests over the four question types. A cross-member isolation test, which is the precursor to the P3 row-level security work. A combined-source test asserting two citation kinds in one answer.
- **Effort:** M
- **Exit signal:** A terminal command answers "what did my last claim cost" from a seeded record, with the field cited.
- **Status:** [x] done, 2026-09-09. No seeded member is on H8010-002: its Part D deductible is not stated in the converted corpus and D-081 refuses to invent one.

---

## Stage 6 - Email OTP authentication

- **Goal:** A working login that a 65-year-old can complete without leaving the conversation.
- **Scope in:** Resend integration. Six-digit code, short expiry, single-use, rate-limited. Session bound to a member row. Inline login inside the chat panel - email field, then code field, no page navigation. Session visibility indicator and one-tap sign out. Automatic expiry with a plain-language explanation.
- **Scope out:** Row-level security and audit logging. Both are P3.
- **Acceptance criteria:**
  - [x] Entering a seeded member's email delivers a six-digit code. Resend accepted a real send on the verified `v-ai.org` domain.
  - [x] The code is pasteable, satisfying WCAG 3.3.8, asserted by test. `autoComplete="one-time-code"`, numeric keypad, no paste handler, and spaces tolerated in the comparison.
  - [x] An expired code is rejected with a clear message.
  - [x] A reused code is rejected. Verified over HTTP.
  - [x] Repeated requests for the same address are rate-limited. Ten per address and thirty per IP an hour, on the existing `rate_events` mechanism.
  - [x] Login completes without navigating away, and the conversation is intact afterward.
  - [x] The signed-in indicator is visible in every state.
  - [x] Sign out clears the session, and a subsequent member question requires login again. Verified over HTTP: signed out the same question refuses, signed in it answers from the record.
  - [x] Session expiry produces a plain-language message, not a silent failure.
  - [x] No credential or code appears in any log. Asserted by test and checked against a real server log.
  - [-] Keyboard-only and screen-reader pass over the login flow. **Not done.** It needs the browser tooling D-040 deferred to P3, and the plan calls this the highest-friction surface in the product for this audience.
- **Test plan:** Integration tests over the full OTP lifecycle including both rejection paths. Log inspection asserting codes never appear. Keyboard-only and screen-reader pass over the login flow, since it is the highest-friction surface in the product for this audience.
- **Effort:** M
- **Exit signal:** You receive a code by email, paste it into the chat panel, and stay in the same conversation.
- **Status:** [x] done, 2026-09-09, minus the keyboard and screen-reader pass, which needs P3's browser tooling. Delivery is confirmed as accepted by Resend; arrival in the inbox is the user's to verify.

---

## Stage 7 - Login detection and member answering

- **Goal:** Close the loop - the assistant recognises a question it cannot answer without identity, offers login, and answers on return.
- **Scope in:** Classifier deciding whether a question needs member data. Plain-language explanation of why login is required. Inline login offer. Automatic answering of the original question after successful login. Member-scoped answering with per-source citation. Cite-or-refuse applied to record-sourced claims.
- **Scope out:** Nothing deferred. This completes the authenticated tier's behaviour.
- **Acceptance criteria:**
  - [x] A member-specific question from a signed-out member offers login rather than refusing or guessing. A fourth outcome, `needs_login`, decided before retrieval.
  - [x] A public question is never gated behind login. 17 public cases in the login set, zero gated, and bucket A unchanged at 37/40.
  - [x] A member-specific question is never answered without a session, asserted directly. Structural since Stage 6: the member id comes from a session row and nowhere else.
  - [x] The original question is answered automatically after login, without re-typing.
  - [x] Record-sourced claims carry record and field citations. `Your member record · Claim CLM-0031 · What you owe`.
  - [x] Combined answers cite each source separately. Verified in Stage 5 and unchanged.
  - [x] Classifier accuracy is measured in both directions and reported, never aggregated. **0 false negatives** against a zero-tolerance gate, **0 false positives** against a 95% floor.
  - [x] Cross-member access is impossible at the application layer, pending P3's database enforcement. `scripts/member-scope-check.ts`, 0 leaks.
- **Test plan:** Both-direction classification tests over an extended golden set, with false negatives reported separately rather than folded into an aggregate accuracy number. Session-boundary integration tests. Auto-answer-on-return test.
- **Effort:** M
- **Exit signal:** Asking "what is my deductible balance" while signed out offers login, and answers itself once you are in.
- **Status:** [x] done, 2026-09-09. Verified over HTTP in both directions.

---

## Stage 8 - Auth-tier eval and deploy

- **Goal:** Extend the quality gate to cover everything P2 added, and ship it.
- **Scope in:** Golden set extended with bucket B questions and both classifier directions. Router accuracy folded into the eval report. CI gates updated. Deployment of the full P2 surface.
- **Scope out:** Nothing.
- **Acceptance criteria:**
  - [ ] The golden set covers bucket B drivers with expected record sources pinned by hand.
  - [ ] Classifier accuracy in both directions is a reported and gated metric.
  - [ ] Router accuracy from Stage 2 is reported in the same output.
  - [ ] Faithfulness on the extended set stays at or above 0.90.
  - [ ] CI fails on any regression in the P1 metrics.
  - [ ] The deployed system completes a full signed-out to signed-in to answered flow.
- **Test plan:** Full eval against the deployed system. Regression assertion that P1 numbers did not degrade, since the added surface area is where regressions hide.
- **Effort:** S
- **Exit signal:** One eval run reports P1 and P2 metrics together, and all gates are green.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Completion Checklist

- [x] Stage 1 - Second plan indexed
- [x] Stage 2 - Structured lookup and router
- [~] Stage 3 - Answer card and freshness (card not delivered, D-069)
- [x] Stage 4 - Session UX cluster (follow-up chips not delivered, D-070)
- [x] Stage 5 - Synthetic member records
- [x] Stage 6 - Email OTP authentication (accessibility pass outstanding)
- [x] Stage 7 - Login detection and member answering
- [ ] Stage 8 - Auth-tier eval and deploy

---

## Cross-Cutting Risks

| Risk | Impact | Mitigated by | Residual |
| --- | --- | --- | --- |
| Router misclassifies a table question as a rules question | Silent degradation back to the failure D-007 exists to prevent | Stage 2 routing test set with a reported confusion matrix | Unspecified selection rule is the known gap; see comment T-3 |
| Cross-plan retrieval leakage | Confidently wrong copay for the wrong plan | Stage 1 negative test | Application-layer only until P3 |
| Login classifier false negative | A member question answered without identity | Stage 7, reported separately from aggregate accuracy | The severe direction; deserves its own threshold |
| Cross-member data access | Disclosure, even with synthetic data | Stage 5 and Stage 7 application-layer tests | Database-level enforcement is P3-01; until then a code path bug is not caught by the database |
| No frozen SRS behind this plan | Requirements drift during the build | Requirements pass required before Stage 5 | Stages 1 through 4 are specifiable from `docs/ideas.md`; the auth tier is not |
| OTP flow defeats the audience | The most valuable tier goes unused | Stage 6 keyboard and screen-reader pass, pasteable codes per WCAG 3.3.8 | Login remains the highest-friction surface in the product |
