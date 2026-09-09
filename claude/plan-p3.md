# Build Plan - P3 (v1.2)

> Scope: `claude/srs.md` §8 v1.2 items - the security hardening beneath the authenticated tier. `docs/ideas.md` §7, entries P3-01 and P3-02.
>
> **Depends on plan-p2 Stage 8.** There is nothing to harden until the authenticated tier exists.
>
> Three stages, not eight. Forcing this group to the skill's usual stage count would be padding.
>
> **Framing that must survive into the build:** every member record is synthetic, so nothing here protects real data. Building these controls against synthetic data is still the point - it demonstrates the production requirements are understood without a covered entity's data ever being involved.
>
> **Effort bands:** **S** ≤ 3h · **M** 4-8h · **L** 9-14h.

| Field | Value |
| --- | --- |
| Plan version | 1.0.0 |
| Status | **Complete.** Ten stages done, shipping as v1.2.0 |
| Source | `claude/srs.md` §8, `docs/ideas.md` §7, `claude/srs-p3.md` v1.0.0 |
| Last Updated | 2026-09-09 |
| Total estimate | ~15h across 3 stages, plus Stage 4 added 2026-09-08 |

---

## Stage Map

| # | Stage | Deliverable | Effort | Cumulative |
| --- | --- | --- | --- | --- |
| 1 | Row-level security | A test proving one session cannot read another member's rows, enforced by the database | M | ~7h |
| 2 | Audit log and minimum-necessary access | Every authenticated answer records who, what, which fields, when | M | ~13h |
| 3 | Real-PHI writeup | Document stating what changes when the data stops being synthetic | S | ~15h |

---

## Stage 1 - Row-level security

- **Goal:** Move member scoping from the application layer into the database, so a code-path bug can no longer leak a member's record.
- **Scope in:**
  - Row-level security policies on every member-scoped table.
  - Session identity propagated to the database connection.
  - Migration written as reversible.
  - Removal of application-layer scoping as the sole protection - it stays as defence in depth, not as the enforcement point.
- **Scope out:** Audit logging. Stage 2 owns it.
- **Acceptance criteria:**
  - [x] A query issued in member 1's session for member 2's rows returns zero rows, asserted at the database layer with application scoping deliberately bypassed. **This is the only test that proves the control exists.**
  - [x] The same assertion holds for every member-scoped table, not only the primary one.
  - [x] An unauthenticated connection reads no member rows at all.
  - [x] Every existing P2 authenticated flow still works after the policies are applied.
  - [x] The migration is reversible and the rollback is executed once. Run inside a transaction that was then rolled back, so production never sat unprotected: 5 tables and 5 policies removed, then restored.
  - [x] Application-layer scoping remains in place and is not removed.
  - [x] A new member-scoped table added without a policy fails a schema test rather than shipping unprotected.
- **Test plan:** The central test connects directly to the database in a member session and attempts to read another member's rows with no application code in the path. Anything less tests the application, not the policy. A schema test enumerates member-scoped tables and asserts a policy exists on each, so the protection cannot be forgotten later. Full P2 regression run.
- **Effort:** M
- **Exit signal:** A direct database query in one member's session returns nothing for another member, with the application bypassed entirely. Met: `npm run check:rls`.
- **Status:** [x] done, 2026-09-09.

---

## Stage 2 - Audit log and minimum-necessary access

- **Goal:** Make every authenticated answer accountable after the fact.
- **Scope in:**
  - Audit record per authenticated answer: which member, what was asked, which fields were read, when, and the resulting outcome.
  - Minimum-necessary field access - queries select only the fields the question requires, not whole records.
  - Session expiry with re-authentication.
  - Audit log immutability from the application - append only, no update or delete path.
- **Scope out:** Retention policy and disclosure accounting. Both are described in Stage 3 rather than built, since they are policy rather than code at this scale.
- **Acceptance criteria:**
  - [x] Every authenticated answer writes exactly one audit record.
  - [x] The record names the specific fields read, not the table. Column plus row id, per D-092.
  - [x] A question needing one field does not read the whole record, asserted by inspecting the executed query. A plan-document question from a signed-in member now reads nothing at all.
  - [x] A refused authenticated question is also audited, with the refusal as the outcome.
  - [x] The application has no code path that updates or deletes an audit record, asserted by test, and the database refuses both by grant.
  - [x] An expired session cannot read member data and prompts re-authentication in plain language, naming which limit was reached.
  - [x] Given an audit record, the fields read can be reconstructed and match what the answer actually cited.
  - [x] No protected field value appears in the audit record itself - it records which fields, not their contents.
- **Test plan:** Integration tests asserting one record per answer including the refusal path. Query inspection for the minimum-necessary assertion, which cannot be verified from the response alone. A test attempting audit mutation through every application entry point. Reconstruction test tying an audit record to the citations in its answer.
- **Effort:** M
- **Exit signal:** Every member answer has an audit row naming the exact fields it read, and nothing in the application can alter one. Met: `npm run check:audit`.
- **Status:** [x] done, 2026-09-09. Also repaired sign-in, which Stage 1 broke: see D-094.

---

## Stage 3 - Real-PHI writeup

- **Goal:** State precisely what changes when the member records stop being synthetic. Written, not built.
- **Scope in:** A document covering: BAA-eligible model tier and why the current deployment already satisfies it; zero-data-retention configuration; encryption in transit and at rest; role-based access control; disclosure accounting; retention and deletion policy; incident response; identity proofing sufficient for a record write, which email OTP is not.
- **Scope out:** Implementing any of it.
- **Acceptance criteria:**
  - [x] Every control names what exists today versus what would have to be added. Eleven controls, each with both halves, asserted by test.
  - [x] The identity-proofing gap is stated explicitly - the current OTP is adequate for reads of synthetic data and inadequate for writes to a real record.
  - [x] The document states which parts of P3 Stages 1 and 2 would carry over unchanged, and which would need strengthening, including the limit of what Stage 1 achieved.
  - [x] Every regulatory claim traces to `docs/research-init.md` or to a CMS or HIPAA source, with no invented requirements. A test asserts every regulation named in the body appears in the sources list.
  - [x] The document answers "what if X happened" for a disclosure, a lost session and an audit request, each saying what cannot be done as well as what can.
- **Test plan:** Not testable by execution. Reviewed against `docs/research-init.md` for source integrity - the failure mode here is inventing a plausible-sounding regulatory requirement, which is worse than omitting one.
- **Effort:** S
- **Exit signal:** A reader can tell exactly which controls are real, which are described, and what the gap costs. Met: `docs/real-phi.md`.
- **Status:** [x] done, 2026-09-09. Measuring the deployment while writing it found two unencrypted-transport facts that were assumed to be fine.

---

## Stage 4 - Spanish

- **Goal:** Answer a Spanish-speaking member in Spanish, from Spanish source documents, with the same citation contract as English.
- **Context:** Moved here from `srs.md` section 8, which listed Spanish as a v1.3 non-goal, on 2026-09-08. It was raised during P1 Stage 9 while adding a voice language selector, and deferred rather than half-built: a Spanish speech-to-text path that still produced an English refusal would have bought nothing.
- **What already exists:** Clover publishes Spanish Evidence of Coverage, Summary of Benefits and Annual Notice of Change for both indexed plans. They are already in the corpus catalog under `documents.spanish` and were confirmed present on 2026-09-08. They are not ingested.
- **Scope in:**
  - Ingest the Spanish document set alongside the English one, with `language` on every chunk.
  - Retrieval scoped by language, so a Spanish question never retrieves English chunks and the reverse.
  - Language detection on the first turn, retained for the session, per the existing FR-24 detector.
  - Speech-to-text told which language to expect, and text-to-speech using a Spanish voice.
  - A language control in the interface, defaulting to detected rather than to English.
  - Citations rendering the Spanish document names, since a member who reads Spanish should be pointed at the Spanish document.
- **Scope out:** Any language beyond English and Spanish. Machine translation of English answers, which would produce an uncited claim in a language no source document supports.
- **Amends:** FR-24, which currently requires stating in English that only English is supported. That requirement stands until this stage ships.
- **Acceptance criteria:**
  - [x] A Spanish question returns a Spanish answer citing a Spanish source document.
  - [x] A Spanish question never retrieves an English chunk. Verified against the live index: 5 of 5 chunks Spanish.
  - [x] An English question never retrieves a Spanish chunk. Verified: 5 of 5 English.
  - [x] The two plans' Spanish Summary of Benefits documents split by column exactly as the English ones do. Needed a fix: the Spanish edition writes `(plan 004)` in lower case.
  - [x] Cost answers agree between the English and Spanish corpora. Specialist $10 and $20 on 004, $2 and $15 on 007, out-of-pocket maximum $9,250 on the PPO and $6,000 on the HMO.
  - [x] Language is detected once and held for the session, and the member can override it with a labelled control in both layouts.
  - [x] Six Spanish cases, and faithfulness reported per language: en 1.000 over 60, es 1.000 over 6.
  - [x] No answer is produced by translating an English answer. Every claim comes from a Spanish chunk, or from the drug list with the mismatch stated (D-093).
- **Test plan:** Ingest tests asserting language scoping on both sides. A paired-amount test comparing English and Spanish answers for the same question, which is the one that catches a mis-split Spanish Summary of Benefits. Golden set extended with Spanish cases scored separately.
- **Effort:** M
- **Exit signal:** The same copay question, asked in Spanish, returns the same amount as the English answer, cited to the Spanish Evidence of Coverage. Met.
- **Status:** [x] done, 2026-09-09.

---

## Stage 5 - Mobile layout

- **Goal:** Make every surface work on a phone, with the floor held at an iPhone 14 Pro.
- **Context:** Added 2026-09-09. The product had two responsive rules in total and had never been rendered at a phone size. Measurement found the assistant rendering 726px of content inside a 393px frame, clipped rather than scrollable because `html, body { overflow-x: hidden }` hid the evidence.
- **Scope in:** A shared breakpoint constant; the assistant as the full page on a phone; the rail relocated; the landing navigation stacked; the voice stage stacked; the height budget rebalanced toward the conversation; a screenshot harness so the result is looked at rather than reasoned about.
- **Scope out:** Landscape phone beyond usable. At 393px tall a pinned header and composer leave little for the conversation, and optimising for it would compromise portrait.
- **Acceptance criteria:**
  - [x] No content is clipped and no page scrolls horizontally at 393x852, 375x667, 768x1024 and 1440x900.
  - [x] The assistant is the full page below the breakpoint, and an open panel converts when the window narrows.
  - [x] The breakpoint is one constant shared by the CSS and the layout switch.
  - [x] Controls sit in the header on a phone; the way back is visible without scrolling.
  - [x] "Talk to a person" is on screen at all times, and not duplicated.
  - [x] Navigation is stacked, with no menu control.
  - [x] The microphone is centred and full size in voice mode.
  - [x] The conversation is the largest region: measured 287px of 852 before, 401px after.
- **Test plan:** `npm run shoot` renders every surface at four viewports, asserts no horizontal overflow, and writes a PNG per surface for review. Static assertions cover the rules themselves.
- **Effort:** M
- **Exit signal:** The floor viewport renders every surface with nothing clipped, verified by looking at it.
- **Status:** [x] done, 2026-09-09. Found and fixed a pre-existing desktop bug: the same width floor clipped the panel at 1440, 1280 and 1024.

---

## Stage 6 - Caching

- **Goal:** Stop paying twice for work already done, without ever changing an answer.
- **Context:** Added 2026-09-09. Promoted from P4-01, which `srs.md` §8 and `srs-p2.md` §8 both list as deferred. `docs/ideas.md` says it "changes nothing" at demo volume and warns that a loose similarity threshold returns a wrong copay; both warnings are in the design rather than argued away.
- **Scope in:** An answer cache keyed on the exact question inside its scope; a query-embedding cache; the audio cache moved off the container filesystem into the same store; hit counters on all three.
- **Scope out:** Semantic matching on similarity. A near-identical question can have a different amount, and this product's whole claim is that an answer is grounded in a document. Also out: caching authenticated turns, and any eviction policy beyond re-indexing.
- **Acceptance criteria:**
  - [x] Emptying every cache changes no answer, only latency.
  - [x] Two questions one word apart key differently, including the in-network and out-of-network forms of the same question.
  - [x] The same question under a different plan, language or snapshot keys differently.
  - [x] A turn carrying a member id is never read from or written to any cache.
  - [x] Only an answered turn is cached; refusals and failures are not.
  - [x] A cached turn records its provider as `cache` in the turn log.
  - [x] A cache read or write that fails does not fail the turn.
  - [x] Audio is served from the store rather than a container filesystem, so a recording survives a restart.
  - [x] Ingest clears the answers for the snapshot it writes, on success and on failure. Embeddings and audio are left, because neither can go stale.
- **Test plan:** Pure-function tests over the keys, including the collision `docs/ideas.md` warns about. Static assertions that the member gate wraps both the read and the write and sits after the guardrails. The operator voice check now measures the store the product actually uses.
- **Effort:** M
- **Exit signal:** A repeated question is answered without a model call, and no two questions that differ in meaning share a key.
- **Status:** [x] done, 2026-09-09. Migration 015 is the operator's to apply.

---

## Stage 7 - Feedback that goes somewhere

- **Goal:** Make "Did this answer your question?" worth asking.
- **Context:** Added 2026-09-09. The control already recorded a yes or a no against the turn, and `npm run insights` already printed the split. What was missing is everything that makes a no actionable: what the assistant actually said, and why the member thought it was wrong.
- **Scope in:** The rendered answer stored with the turn for public turns; four fixed reasons after a no; a report view that excludes the session id; an operator report listing rated-wrong answers as golden-set candidates.
- **Scope out:** Free text, which is the one surface that could put a condition into the store. Fine-tuning, which has no pipeline here and would be speculative scaffolding; the answers come from retrieval and a prompt, not from weights.
- **Acceptance criteria:**
  - [x] A rating is stored with the answer it rates and the time it was given.
  - [x] A turn that carried a member id stores no answer text.
  - [x] The reason is one of four, enforced by a database constraint as well as the form, and the endpoint drops anything else.
  - [x] The no is recorded before the reason is asked.
  - [x] No feedback surface accepts free text.
  - [x] Analysis reads a view with no session id; the turn keeps the column the loop breaker needs.
  - [x] The operator report lists rated-wrong answers with their reason and route.
- **Test plan:** Static assertions over the constraint, the endpoint filter and the absence of any text input. Live verification of the view's columns and of a member turn storing no answer.
- **Effort:** M
- **Exit signal:** A thumbs-down produces a row an operator can turn into a golden-set case without asking the member anything else.
- **Status:** [x] done, 2026-09-09. Migration 016 is the operator's to apply.

---

## Stage 8 - A transcript the member can keep

- **Goal:** Turn the export control into a file the member downloads, rather than a print dialog they have to steer.
- **Context:** Added 2026-09-09. `window.print()` and the print stylesheet have shipped since P2 (FR-P2-20) and the browser could already save the page as a PDF, but only via a dialog whose "Save as PDF" destination this audience has to find. No browser API steers that dialog to a file, so a download means generating the bytes.
- **Scope in:** A PDF built on the device from the conversation in memory, carrying every question, every answer, the numbered sources, the plan, the document date, the synthetic-data notice and the Member Services number; a notice on page one when the file holds member-record data; chrome in the conversation's language; the library fetched only on press; the print stylesheet kept as the fallback.
- **Scope out:** Server-side rendering, which would put a signed-in member's answer back on the wire for no gain. Styled layout beyond text: no logo image, no colour, no HTML-to-canvas rasterisation, which produces a large file of unselectable pixels. Emailing the transcript, which is a different feature with a different threat model.
- **Acceptance criteria:**
  - [x] Pressing the control downloads a `.pdf` without opening a dialog.
  - [x] Every turn on screen is in the file, with source numbers matching the on-screen markers.
  - [x] The file names its plan, its document date, its save date, the synthetic-data notice and the Member Services number.
  - [x] A file containing an answer cited to the member's own record says so on page one; one that does not, does not.
  - [x] The chrome is Spanish when the conversation is Spanish.
  - [x] The library is a separate chunk, absent from the initial bundle.
  - [x] A failed build says so and falls back to the print view.
- **Test plan:** The document model is pure data, so content, ordering, numbering, language and the member notice are asserted directly rather than by parsing a PDF. One render test proves the bytes are a real multi-page PDF and that Spanish accents survive. A static test asserts the control no longer calls `window.print()` and that the print stylesheet is still there.
- **Effort:** M
- **Exit signal:** A member presses one button and has a file they can hand to a doctor, with every source and no application chrome.
- **Status:** [x] done, 2026-09-09.

---

## Stage 9 - Comments that earn their place, and a documented corpus

- **Goal:** Bring every comment in the code under the rule `CLAUDE.md` §5 already states, and answer in the README where the corpus came from.
- **Context:** Added 2026-09-09. Roughly 2,500 comment lines had accumulated, 410 of them carrying requirement ids, decision ids or stage numbers. Those references were written when the plan was open on the next screen; a reader without it gets a dead pointer and a paragraph where a line would do.
- **Scope in:** `src`, `web/src`, `tests`, `scripts`, `eval`, `migrations` and the stylesheets. A test that fails on any comment carrying an id or a stage, so the rule holds without anyone remembering it. A README section giving the corpus provenance in full, with figures measured on the day.
- **Scope out:** `claude/` and `docs/`, whose subject is the plan itself; stripping stage headings from a build plan deletes the document. Behaviour of any kind: this stage changes no code path.
- **Acceptance criteria:**
  - [x] No comment carries a requirement id, a decision id, a stage or a release.
  - [x] Comments run to 15 words, or two lines where the code looks wrong but is right.
  - [x] No comment restates the line beneath it or describes code it does not sit on.
  - [x] The suite and the typecheck pass with the same counts as before the sweep.
  - [x] A gate fails on a reintroduced id.
  - [x] The README states the source, the fetch, the conversion, the split and how much reached the index, measured.
- **Test plan:** The existing suite is the behaviour proof, since nothing but comments changed. One new test enumerates every comment in the swept trees and fails on a reference. Corpus figures verified against the snapshot manifest and the live database.
- **Effort:** M
- **Exit signal:** A reader who has never seen the plan can read any file in the repository and learn only things that are true about the code in front of them.
- **Status:** [x] done, 2026-09-09.

---

## Stage 10 - Security review and posture

- **Goal:** Audit what is actually enforced, fix what is small and safe, and write the posture down including its gaps.
- **Context:** Added 2026-09-09. The controls were strong and scattered: body ceilings, rate limits, row-level security, redaction, scrypt OTPs, an append-only audit log and a secret scan all existed, but nothing stated the posture in one place, and an audit found five real gaps.
- **Scope in:** One request-validation module replacing narrowing scattered across handlers; `Secure` on both cookies, derived from the forwarded protocol; a Content-Security-Policy on the served page; a dependency audit in CI that blocks on critical and reports high; `docs/security.md` covering input validation, prompt injection, monitoring, dependency posture and what is not protected.
- **Scope out:** Zod, which `CLAUDE.md` names but which would replace working, tested validation with a dependency. `SECURITY.md`, left as the user chose. Dropping the local reranker to clear four unfixable advisories, which would remove the cross-encoder the confidence floor is calibrated against.
- **Acceptance criteria:**
  - [x] One module validates every request body; handlers call it rather than narrowing inline.
  - [x] Oversized bodies are destroyed before a handler runs.
  - [x] Both cookies carry `Secure` over HTTPS and not on a plaintext local port.
  - [x] The page carries a Content-Security-Policy and still works under it, verified in a browser.
  - [x] CI fails on a critical advisory and prints highs.
  - [x] Four unfixable advisories are documented with the reason each vulnerable path is unreachable.
  - [x] The security document states what is not protected.
- **Test plan:** Unit tests over the validation module for every field, type and ceiling. Static assertions over the cookie flags, the CSP and the CI audit step. The built page loaded in a real browser under the CSP, checking for violations rather than reading the header.
- **Effort:** M
- **Exit signal:** A reader can learn what this product defends against, what it does not, and which dependency advisories are open and why, from one page.
- **Status:** [x] done, 2026-09-09.

---

## Completion Checklist

- [x] Stage 1 - Row-level security
- [x] Stage 2 - Audit log and minimum-necessary access
- [x] Stage 3 - Real-PHI writeup
- [x] Stage 4 - Spanish
- [x] Stage 5 - Mobile layout
- [x] Stage 6 - Caching
- [x] Stage 7 - Feedback that goes somewhere
- [x] Stage 8 - A transcript the member can keep
- [x] Stage 9 - Comments that earn their place, and a documented corpus
- [x] Stage 10 - Security review and posture

---

## Cross-Cutting Risks

| Risk | Impact | Mitigated by | Residual |
| --- | --- | --- | --- |
| Row-level security tested through the application | Proves nothing; the application scoping was already passing | Stage 1's central test bypasses application code entirely | The single most common way this control is mis-verified |
| A later member-scoped table ships without a policy | Silent hole opening after the work is considered done | Stage 1 schema test enumerating tables and asserting policies | Requires the test to be maintained as tables are added |
| Audit log records field contents rather than field names | Turns the audit trail into a second copy of the data it audits | Stage 2 acceptance criterion asserting values are absent | - |
| Invented regulatory requirements in the writeup | Undermines the credibility of everything else in the project | Stage 3 source-integrity review against `docs/research-init.md` | Omission is acceptable; invention is not |
| Controls built but never demonstrated | The work is the deliverable and nobody sees it | Stage 3 states what carries over; the tests themselves are the evidence | Worth a walkthrough moment rather than a mention |
| Spanish answers drift from English ones | Two members on the same plan get different amounts | Stage 4 paired-amount test across both corpora | A drift here is a corpus defect and must be reported, not reconciled in the prompt |
| Spanish produced by translating English | An uncited claim in a language no source supports | Stage 4 scope-out, and language-scoped retrieval enforced by test | The tempting shortcut, and the one that breaks cite-or-refuse |
