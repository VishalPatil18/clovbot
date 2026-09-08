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
| Source | `claude/srs.md` §8, `docs/ideas.md` §7 |
| Last Updated | 2026-09-07 |
| Total estimate | ~15h across 3 stages |

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
  - [ ] A query issued in member 1's session for member 2's rows returns zero rows, asserted at the database layer with application scoping deliberately bypassed. **This is the only test that proves the control exists.**
  - [ ] The same assertion holds for every member-scoped table, not only the primary one.
  - [ ] An unauthenticated connection reads no member rows at all.
  - [ ] Every existing P2 authenticated flow still works after the policies are applied.
  - [ ] The migration is reversible and the rollback is executed once in a test environment.
  - [ ] Application-layer scoping remains in place and is not removed.
  - [ ] A new member-scoped table added without a policy fails a schema test rather than shipping unprotected.
- **Test plan:** The central test connects directly to the database in a member session and attempts to read another member's rows with no application code in the path. Anything less tests the application, not the policy. A schema test enumerates member-scoped tables and asserts a policy exists on each, so the protection cannot be forgotten later. Full P2 regression run.
- **Effort:** M
- **Exit signal:** A direct database query in one member's session returns nothing for another member, with the application bypassed entirely.
- **Status:** [ ] not started · [ ] in progress · [ ] done

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
  - [ ] Every authenticated answer writes exactly one audit record.
  - [ ] The record names the specific fields read, not the table.
  - [ ] A question needing one field does not read the whole record, asserted by inspecting the executed query.
  - [ ] A refused authenticated question is also audited, with the refusal as the outcome.
  - [ ] The application has no code path that updates or deletes an audit record, asserted by test.
  - [ ] An expired session cannot read member data and prompts re-authentication in plain language.
  - [ ] Given an audit record, the fields read can be reconstructed and match what the answer actually cited.
  - [ ] No protected field value appears in the audit record itself - it records which fields, not their contents.
- **Test plan:** Integration tests asserting one record per answer including the refusal path. Query inspection for the minimum-necessary assertion, which cannot be verified from the response alone. A test attempting audit mutation through every application entry point. Reconstruction test tying an audit record to the citations in its answer.
- **Effort:** M
- **Exit signal:** Every member answer has an audit row naming the exact fields it read, and nothing in the application can alter one.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 3 - Real-PHI writeup

- **Goal:** State precisely what changes when the member records stop being synthetic. Written, not built.
- **Scope in:** A document covering: BAA-eligible model tier and why the current deployment already satisfies it; zero-data-retention configuration; encryption in transit and at rest; role-based access control; disclosure accounting; retention and deletion policy; incident response; identity proofing sufficient for a record write, which email OTP is not.
- **Scope out:** Implementing any of it.
- **Acceptance criteria:**
  - [ ] Every control names what exists today versus what would have to be added.
  - [ ] The identity-proofing gap is stated explicitly - the current OTP is adequate for reads of synthetic data and inadequate for writes to a real record.
  - [ ] The document states which parts of P3 Stages 1 and 2 would carry over unchanged, and which would need strengthening.
  - [ ] Every regulatory claim traces to `docs/research-init.md` or to a CMS or HIPAA source, with no invented requirements.
  - [ ] The document answers "what if X happened" for at least three failure scenarios: a disclosure, a lost session, an audit request.
- **Test plan:** Not testable by execution. Reviewed against `docs/research-init.md` for source integrity - the failure mode here is inventing a plausible-sounding regulatory requirement, which is worse than omitting one.
- **Effort:** S
- **Exit signal:** A reader can tell exactly which controls are real, which are described, and what the gap costs.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Completion Checklist

- [ ] Stage 1 - Row-level security
- [ ] Stage 2 - Audit log and minimum-necessary access
- [ ] Stage 3 - Real-PHI writeup

---

## Cross-Cutting Risks

| Risk | Impact | Mitigated by | Residual |
| --- | --- | --- | --- |
| Row-level security tested through the application | Proves nothing; the application scoping was already passing | Stage 1's central test bypasses application code entirely | The single most common way this control is mis-verified |
| A later member-scoped table ships without a policy | Silent hole opening after the work is considered done | Stage 1 schema test enumerating tables and asserting policies | Requires the test to be maintained as tables are added |
| Audit log records field contents rather than field names | Turns the audit trail into a second copy of the data it audits | Stage 2 acceptance criterion asserting values are absent | - |
| Invented regulatory requirements in the writeup | Undermines the credibility of everything else in the project | Stage 3 source-integrity review against `docs/research-init.md` | Omission is acceptable; invention is not |
| Controls built but never demonstrated | The work is the deliverable and nobody sees it | Stage 3 states what carries over; the tests themselves are the evidence | Worth a walkthrough moment rather than a mention |
