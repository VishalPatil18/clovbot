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
| Status | **Complete.** All four stages done, shipping as v1.2.0 |
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

## Completion Checklist

- [x] Stage 1 - Row-level security
- [x] Stage 2 - Audit log and minimum-necessary access
- [x] Stage 3 - Real-PHI writeup
- [x] Stage 4 - Spanish

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
