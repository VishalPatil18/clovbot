# What changes when the records stop being synthetic

> **Nothing in this system holds real member data, and nothing in this document is a plan to change that.** Every member record in clovbot is invented, labelled synthetic in the schema, in the seed and in the output, and D-047 makes that binding at every version rather than only the first.
>
> This document exists because building access controls over invented data proves you understood the requirement, and claiming more than that would be the opposite. It states, control by control, what is real here and what a real deployment would still owe.

**On sources.** Regulatory claims trace to `docs/research-init.md` or to a named regulation. Where a section number appears it is a pointer for a reviewer to check, not a quotation from anything held in this repository, and none of this is legal advice. Omitting a real requirement is a gap; inventing a plausible one would undermine every other claim here, so where something is unverified this document says so instead of guessing.

---

> The posture that exists **today**, over synthetic data, is in [docs/security.md](./security.md). This document is the delta a real deployment would owe on top of it.

## 1. The boundary that already exists

`docs/research-init.md` §2 draws the line this product is built on, and it is worth restating before the controls, because most of the HIPAA surface is avoided rather than mitigated.

- **This is "communications", not "marketing"** (42 CFR 422.2260-2274). A member-support assistant answering benefits questions sits outside the strictest HPMS pre-approval regime. CMS can still require review of any material on complaint or data.
- **It informs, it does not adjudicate.** Binding guidance is CMS-4201-F plus the 6 February 2024 FAQ: AI may assist but must not make coverage denials. FR-17 carries this into the product as a standing rule, and the guardrails refuse coverage-decision questions by rule before retrieval rather than by asking the model to decline.
- **Reading a member's own stored claim back to them is disclosure of a record, not adjudication of a claim.** That distinction is what makes the authenticated tier a records feature rather than a decisions feature.

None of this changes when the data becomes real. What changes is everything below.

---

## 2. The controls, one at a time

`docs/research-init.md` §2 lists five conditions for handling PHI with an LLM: a BAA-eligible tier, zero-data-retention configuration, minimum-necessary plus RBAC, audit logging, and encryption. It also says the part that is easy to miss: **the BAA covers the vendor's side only. The covered entity still owns audit and disclosure.**

### 2.1 BAA-eligible model tier

**Required:** a tier the vendor will sign a BAA for. The briefing names Azure OpenAI, the OpenAI API and Enterprise tiers, Anthropic's API and enterprise tiers, AWS Bedrock and Google Vertex, and rules out the consumer ChatGPT and Claude.ai tiers.

**Today:** generation and embeddings run against **Azure OpenAI** (`gpt-4o`, `text-embedding-3-small`, API version `2025-01-01-preview`), which is on that list. The briefing's own advice was to use a BAA-eligible tier in v1 as a hygiene signal, and that is what happened.

**Still owed:** an executed BAA. Eligibility is not a BAA. No agreement exists for this case study and none is needed, because no covered entity's data is involved.

### 2.2 Zero data retention

**Required:** the model vendor must not retain prompts or completions.

**Today:** **not configured, and not verified.** The Azure deployment runs on default settings. Whatever abuse-monitoring retention applies to that resource, this project has neither requested an exemption nor confirmed the current behaviour, and this document will not restate a retention period it has not checked.

**Still owed:** the configuration itself, plus evidence of it. This is a prerequisite rather than a nice-to-have: every prompt this system sends to the model contains the retrieved chunks, and under the authenticated tier those chunks include record fields.

### 2.3 Encryption in transit and at rest

**Required:** encryption. The briefing lists it without elaboration.

**Today, and this is the control that measured worst.** Two findings, both checked against the running system rather than assumed:

- **The client-to-pooler hop is TLS with a pinned CA.** `src/rag/store.ts` sets `rejectUnauthorized: true` against `certs/supabase-ca.crt`, so a connection that failed verification would not open at all.
- **The pooler accepts plaintext.** A client that simply omits the TLS options connects successfully. Encryption in transit is therefore a **convention this application follows, not a rule the server enforces**. Any other client, or one line deleted, and traffic goes in the clear.
- **`pg_stat_ssl` reports no TLS on the backend serving our queries.** The client's TLS terminates at Supavisor; the pooler-to-database hop runs inside Supabase's network without it.

**Still owed:** enforce TLS on incoming connections at the database, so the guarantee stops depending on client code. The internal hop is Supabase's to answer for and would need to be covered by their BAA and their architecture rather than by anything in this repository.

**At rest:** Supabase's managed Postgres encrypts at rest by default. That is the vendor's statement, not something this project has independently verified, and it is listed here as a claim to confirm rather than a control to tick.

### 2.4 Minimum necessary

**Required:** use or disclose only what the purpose needs (45 CFR §164.502(b)).

**Today:** implemented and measured, in P3 Stage 2. The rule that decides whether a signed-out member must sign in is the same call that decides what is read, so the gate and the access cannot disagree (D-091). Concretely:

- A signed-in member asking what a specialist visit costs now reads **zero** record fields. Before Stage 2 that question read claims, prior authorisations, accumulators and appointments, because being signed in was by itself enough to load the whole record.
- A claim question reads the claims table and nothing else, by named columns rather than `select *`.
- **Nothing reads the member's name.** No answer addresses them by it, so no query fetches it.

**Still owed:** little, in kind. The mapping from topic to columns is a hand-maintained list, and with real data it would want a test that fails when a new topic is added without one.

### 2.5 Role-based access control

**Required:** RBAC. The briefing also recommends row-level security for any member data (§6).

**Today:** two roles. The application connects as `clovbot_app`, which cannot bypass row-level security, owns nothing, and holds 23 grants covering exactly what the running product executes. Schema changes, ingest and seeding use the owning role. Five member-scoped tables have row-level security enabled **and forced**, each with a policy comparing the row to an identity carried transaction-locally on the connection. A direct query in one member's identity returns zero of another member's rows, proven with the application bypassed (`npm run check:rls`).

**Still owed, and this is the honest limit of what Stage 1 achieved:**

- **The identity is set by application code.** The policies filter on `clovbot.member_id`, and that value is put there by `withMemberIdentity`. Row-level security moved the trust boundary from *every query* to *one function*, which is a large improvement and is not the same thing as the database deciding independently. A compromised application can still set any member id it likes.
- **RBAC here means member-versus-member.** There are no staff roles, because there is no staff. A real deployment needs roles for support agents, engineers and analysts, each with a different slice, and none of that exists.
- **No break-glass path**, and no record of one being used.

### 2.6 Audit logging

**Required:** audit controls (45 CFR §164.312(b)).

**Today:** every authenticated turn writes exactly one row to `member_access_log`, whatever the outcome, naming the member, the session, the redacted question, the fields read as `table.column@row-id`, the time, and the result. The row holds **no field contents**: a claim id locates a row, a claim amount is the protected thing and never appears (D-092). The log is derived from the same structures the answer is built from, so a cited field cannot be missing from it. It is append-only by grant rather than by convention: the application role holds `insert` and `select` and nothing else, and `update` and `delete` are refused by the database (`npm run check:audit`).

**Still owed:**

- **Append-only from the application is not tamper-evidence.** The owning role can still rewrite history. Real PHI wants writes the operator cannot silently alter: a hash chain, an append-only sink outside the same database, or both.
- **Nobody can read the log but the member it describes.** There is no compliance view, no export, no alerting on unusual access patterns.
- **Retention is undefined.** Rows accumulate forever, which is not a policy.

### 2.7 Disclosure accounting

**Required:** on request, an accounting of disclosures (45 CFR §164.528).

**Today:** the raw material exists and the feature does not. `member_access_log` records access, which is most of what an accounting is built from.

**Still owed:** the distinction between *access* and *disclosure*, which this log does not draw. It records that the assistant read a field; a disclosure accounting is about the field leaving the covered entity. Those diverge here in a way worth naming, in §2.9.

### 2.7a Feedback, and a second store of generated text

**Today:** a rating a member gives on an answer is stored on the turn, with the answer text, the reason from a fixed set of four, and the time. **The answer is not stored when the turn carried a member id**, so no record-derived text reaches this table. There is no free-text field anywhere in the feedback surface, which is deliberate: identifier redaction catches a member id and not a condition someone types.

**Still owed:** the same retention question as everything else in §2.8, and an honest label. The turn log is **pseudonymous, not anonymous**. A session id links every question in one visit and the loop breaker needs it, so it stays on the row; analysis reads a view that excludes it. That is a narrower claim than anonymity and is the one this document is prepared to make.

### 2.7b The transcript leaves on the member's own device

**Today:** the export builds the PDF **in the browser**, from the conversation already in memory, and hands it to the download. Nothing is posted to the service to be rendered, so a signed-in member's claim amounts never make a second trip over the wire or into a request log. When any answer in the file cites the member's own record, the first page says so, because the file then sits in a downloads folder on a device that may be shared.

**Still owed:** nothing technical. Once the file exists it is the member's, on their hardware, outside anything this system can enforce - which is the correct end state for a record they asked for, and worth stating rather than leaving implied.

### 2.8 Retention and deletion

**Required:** a stated policy, and the ability to honour it.

**Today:** nothing is deleted, anywhere. Turns, callbacks, access-log rows and login codes all persist. One thing does get cleared, and it is the one nobody would have thought to ask for: **signing out removes record-sourced turns from the conversation saved in the browser**, on the shared-device reasoning that a caregiver holding the tablet is indistinguishable from the member. That clearing matched only the English citation label until 2026-09-09, so a Spanish member's record-sourced answers survived a sign-out; it now matches both.

**Still owed:** the policy itself, deletion that actually runs, and the interaction between deletion and the audit log, which must not be deletable on the same schedule as the thing it audits.

### 2.9 What leaves this system, which the briefing's list does not cover

**Required:** a BAA with every vendor that receives protected data, not only the model vendor. `docs/research-init.md` §2 is explicit that a BAA covers that vendor's side alone.

**Today:** three outbound paths carry answer content to third parties, and none is covered by an agreement. Naming them is the point of writing this down.

- **Spoken answers go to a voice vendor.** ElevenLabs, with Fish Audio as fallback, receives the answer text to synthesise. Under the authenticated tier that text can contain a claim amount or a prior-authorisation status. This is the clearest case of PHI leaving the system to a vendor with no agreement, and it is not covered by the model vendor's BAA.
- **Speech-to-text sends the member's recorded question** to the same chain. A member says "what did my claim for my dermatologist visit cost", and that audio leaves.
- **Sign-in email goes through Resend.** The code is not PHI. The fact that a given address is enrolled in a Medicare Advantage plan arguably is, and the addresses are real ones held only in the environment.

**Still owed:** a BAA per vendor, or the feature goes. For voice specifically, an on-device or self-hosted synthesiser would keep the answer inside the boundary; that is a real architectural cost and the honest alternative is dropping spoken answers for authenticated content.

### 2.10 Incident response

**Required:** breach notification without unreasonable delay and no later than 60 days after discovery (45 CFR §164.404).

**Today:** nothing. There is no on-call, no severity scale, no notification path and no rehearsal. Server errors are logged to the console and a post-delivery failure is logged rather than shown to the member.

**Still owed:** all of it. The one piece that exists is the ability to answer *what was read* after the fact, which is the hardest part to add retroactively and the reason Stage 2 is worth having even over invented data.

### 2.11 Identity proofing, which is the gap that matters most

**Today:** an emailed six-digit code. It is deliberately good at what it does: never stored, only a scrypt hash with a per-code salt, single use, ten-minute expiry, five attempts, timing-safe comparison, and an unknown address gets the identical reply so the endpoint cannot be used to discover who is enrolled. It also satisfies WCAG 2.2 3.3.8 by being pasteable, which for a 65+ audience is not a small thing (`docs/research-init.md` §5).

**What it proves:** control of an inbox.

**What it does not prove:** that the person is the member. An emailed code is adequate for **reads of synthetic data**, which is all it is asked to do here. It is **inadequate** for a write to a real record: a change of address, an ID-card reissue, anything that alters what the plan believes. Control of an inbox is not identity, and inboxes are the single most commonly compromised consumer credential.

**Still owed for writes:** proofing at a level appropriate to the action, which for a Medicare Advantage member typically means knowledge of plan-held facts, a second factor bound to something other than email, or a call-back to a number already on file. The product currently avoids the question by never writing to a record, and that is a deliberate scope boundary rather than an oversight. `docs/research-init.md` §2 puts ID-card reissue on the authenticated side of the line; this document narrows that further, to say that reads and writes are not the same authentication problem.

---

## 3. What carries over, and what does not

**Carries over unchanged.** These were built for synthetic data and would be no different for real data:

- The two-role model, and an application role that cannot bypass policies.
- Row-level security enabled and forced, with a per-table policy.
- Transaction-local identity, which the connection pooler makes necessary rather than optional.
- The reasoning for the exempt sign-in tables, and the definer function that keeps the email lookup narrow.
- The schema check that fails when a member-scoped table arrives without a policy. It caught a real omission within an hour of being written.
- Minimum-necessary topic scoping, and an audit derived from the facts an answer was built from.
- Cite-or-refuse. A record answer carries a citation to the field it read, exactly as a document answer does.

**Needs strengthening before real data:**

| Control | Why it is not enough |
| --- | --- |
| Row-level security | The identity is set by application code. Trust moved from every query to one function; it did not leave the application. |
| Audit log | Append-only from the application, not tamper-evident against the operator. |
| RBAC | Member-versus-member only. No staff roles, no break-glass, no proportionate access. |
| Encryption in transit | Enforced by the client, not required by the server, and the internal hop is unencrypted. |
| Session lifetime | Eight hours absolute is generous for a shared device. Defensible for a demo; a decision to revisit with real records. |
| Disclosure accounting | Access is recorded. Disclosure to third parties is not, and §2.9 lists three paths that would need it. |
| Retention | No policy, no deletion, and no separation between deleting data and deleting its audit trail. |

---

## 4. What if this happened

### A disclosure

**Suppose a code path set the wrong member id and a member saw someone else's claim.**

What we can do today: name the member, the session, the exact question, every field read down to the row, and the time, from `member_access_log`. That is most of what a notification needs and it is available immediately rather than reconstructed from application logs.

What we cannot do: prove the log is complete. The audit write happens in the same application that made the mistake. It runs on every path and a failed write fails the turn before any answer reaches the member, so the design is sound, but a bug that skipped the read path entirely would also skip the record of it. **Tamper-evidence and an independent sink are what would close this**, and they are the single most valuable thing to add first.

Also worth saying plainly: row-level security makes this specific failure much harder, because the wrong id would have to be set deliberately rather than arrived at by forgetting a `where` clause. It does not make it impossible.

### A lost session

**Suppose a member's device is taken while signed in.**

Today: the session dies after 30 minutes idle or 8 hours absolute, whichever comes first, and both are checked server-side on every request against the session row rather than trusting the cookie. The cookie is `HttpOnly; SameSite=Lax`, minted fresh at sign-in so a fixated value is useless. Signing out ends the row and clears record-sourced answers from the browser's saved conversation, leaving the general ones.

The gap: **the member cannot end a session they are not holding.** There is no session list, no "sign out everywhere", and no way for support to end one on request. With real records that is the first thing someone would ask for on this call, and the data to build it already exists in `member_sessions`.

Eight hours is also the wrong default for a device that leaves the house. It was chosen for a demo where re-authenticating repeatedly would obscure the flow.

### An audit request

**Suppose the plan asks: which of this member's fields did the assistant read last month, and why.**

Today: answerable by query. Every row names the topic that caused the read, the redacted question, the fields, and the outcome, and the fields can be replayed against the citations of the answer they produced. A read that happened for no good reason would stand out, because a turn that needed nothing records zero fields.

What is missing is the shape of an answer rather than the data behind it: no report, no export, no retention window, and no way for anyone but the member to read their own rows. The policy on the log is keyed to the member, which is right for the member's own access and wrong for a compliance function that does not yet exist.

---

## 5. The honest summary

Three of the five conditions in `docs/research-init.md` §2 are genuinely built: minimum-necessary, RBAC, and audit logging, each verified against a running database rather than asserted. One is partly built and measured worse than expected: encryption in transit is a client-side convention with an unencrypted internal hop. One is not built at all: zero data retention.

Beyond that list, the material gaps are tamper-evidence on the audit log, an identity-proofing level sufficient for writes, BAAs for the three vendors that receive answer content, and a retention policy that exists.

The controls are real. The data is not, and the second half of that sentence is what keeps the first half from being a claim this project has no standing to make.

---

## Sources

- `docs/research-init.md` §2 (HIPAA conditions, CMS communications-versus-marketing, CMS-4201-F, the public-versus-authenticated split), §5 (WCAG 2.2 and the 65+ audience), §6 (row-level security for member data).
- 42 CFR 422.2260-2274; CMS-4201-F and the CMS FAQ of 6 February 2024.
- 45 CFR §164.502(b) minimum necessary; 45 CFR §164.312(b) audit controls; 45 CFR §164.404 breach notification; 45 CFR §164.528 accounting of disclosures. Cited by section for a reviewer to check; no text from these is held in this repository.
- This system, measured: `npm run check:rls`, `npm run check:audit`, `pg_stat_ssl`, and the grant catalogue.
- D-001 and D-047 (zero real PHI, at every version), D-085 (code storage and the membership oracle), D-090 to D-094 (the P3 controls).
