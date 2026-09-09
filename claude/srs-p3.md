# Software Requirements Specification - P3 (v1.2)

> **Scope of this document is `docs/ideas.md` §7 (P3-01, P3-02), the Spanish tier and the mobile layout, built as the five stages of `claude/plan-p3.md`.** It is a companion to `claude/srs.md` and `claude/srs-p2.md`, not a replacement. Both predecessors stay frozen as the requirements their releases were built against (D-050).
>
> Requirement ids are namespaced `FR-P3-NN` and `NFR-P3-NN` and do not collide with P1's `FR-NN` or P2's `FR-P2-NN`. Where an earlier requirement still binds, it is cited by its own id.
>
> **FROZEN on completion of this pass.** Amend only by re-running `/spec-requirements` and bumping the version.

| Field | Value |
| --- | --- |
| Project | Clover Member Assistant |
| Version | 1.5.0 |
| Status | Frozen |
| Last Updated | 2026-09-09 |
| Covers | `claude/plan-p3.md` stages 1-9, shipping as v1.2.0 |
| Sources | `docs/ideas.md` §7 P3-01 and P3-02, `claude/plan-p3.md`, `claude/srs.md` v1.1.0, `claude/srs-p2.md` v1.0.1, `docs/research-init.md`, D-047, D-080, D-085 |
| Predecessor | `claude/srs-p2.md` v1.0.1 (P2, frozen) |
| Amendments | 1.5.0 - Stage 9 added 2026-09-09 with FR-P3-78 to FR-P3-83 and NFR-P3-19. 1.4.0 - Stage 8 added 2026-09-09 with FR-P3-70 to FR-P3-77 and NFR-P3-18. 1.3.0 - Stage 7 added 2026-09-09 with FR-P3-63 to FR-P3-69 and NFR-P3-17. 1.2.1 - FR-P3-62 added 2026-09-09. 1.1.0 - Stage 5 added 2026-09-09 with FR-P3-45 to FR-P3-52 and NFR-P3-13, NFR-P3-14. 1.2.0 - Stage 6 added 2026-09-09 with FR-P3-53 to FR-P3-61 and NFR-P3-15, NFR-P3-16, promoting P4-01 |

---

## 1. Overview

v1.1.0 added an authenticated tier over synthetic member records. A member signs in with an emailed code and asks about their own claim, prior authorisation or remaining balance, and every answer cites the record and the field it read.

That tier has one boundary and it is a `where` clause. `loadMemberRecord` scopes by member id in every query, and nothing below it enforces anything. A bug in one function, or a new code path that forgets the clause, reads another member's record and no layer objects. `NFR-P2-10` states this residual risk rather than hiding it, and names P3 as where it closes.

P3 closes it three ways and then adds a fourth thing that is not security at all.

**Stage 1** moves member scoping into the database. The application connects as a role that cannot bypass row-level security, policies compare each row against an identity carried on the connection, and the proof is a direct query with no application code in the path.

**Stage 2** makes each authenticated answer accountable and narrows what it reads. Today, being signed in is by itself enough to read the whole record: the router adds the member path on identity alone, and `loadMemberRecord` runs `select *` across five tables. A signed-in member asking a specialist copay has their claims, prior authorisations and appointments read to answer it. After Stage 2, the rule that decides whether a member must sign in also decides what is read, and every read is recorded.

**Stage 3** writes down what changes when the records stop being synthetic. It builds nothing.

**Stage 5** makes every surface work on a phone. It was added on 2026-09-09, after measurement found the assistant rendering 726 pixels of content inside a 393 pixel frame, clipped rather than scrollable because `html, body { overflow-x: hidden }` hid the evidence. The same floor clipped the desktop panel at 1440.

**Stage 4** answers a Spanish-speaking member in Spanish from Spanish source documents. Clover publishes a Spanish Evidence of Coverage, Summary of Benefits and Annual Notice of Change for all three indexed plans, confirmed present in the catalog. They are not ingested, and `FR-24` currently refuses in English.

**Every member record in this system is invented.** Nothing in Stages 1 and 2 protects real data, and the writeup in Stage 3 exists because that distinction has to be stated rather than assumed. Building the controls against synthetic data demonstrates that the production requirements are understood without a covered entity's data ever being involved.

---

## 2. Personas

Unchanged from P2 §2. P3 adds no persona and no state a member can see, with one exception: the Spanish-reading member, who until now was refused in English.

| Persona | Profile | Primary Need | What P3 changes |
| --- | --- | --- | --- |
| **Member, signed in** (primary) | As P2 §2. | Their own record, cited to the field. | Nothing visible, and that is the intent. Their record is read narrowly and every read is recorded. An expired session says so in plain language instead of failing oddly. |
| **Member, Spanish-reading** (primary, new) | The same audience. Clover publishes its plan documents in Spanish because a material share of its members read Spanish first. | An answer in the language they asked in, pointing at the document they can actually read. | Asks in Spanish, gets Spanish, cited to the Spanish Evidence of Coverage rather than refused. |
| **Compliance reviewer** (secondary, new) | Reads the deliverable to judge whether the controls are real. Not a user of the product. | To tell which controls exist, which are described, and what the gap costs. | Stage 3 is written for this reader. The Stage 1 and 2 tests are the evidence behind it. |
| **Caregiver** (secondary) | As P2 §2. | An answer they can verify and pass along. | Unchanged. Auth still grants them nothing, and a Spanish answer prints with its Spanish citation intact. |

---

## 3. Jobs To Be Done

P1's nine and P2's six still stand. P3 adds two, one of which is not a member's.

- **Ask in Spanish and be answered in Spanish**, from a document published in Spanish, with the same citation on every claim.
- **Account for what was read** - not a member's job, but the plan's. Given a member and a date, say which fields of their record the assistant read and why.

No existing job is removed. One is narrowed on purpose: a signed-in member asking a public question no longer has their record read to answer it, because nothing in that answer comes from it.

---

## 4. Functional Requirements

### 4.1 Row-level security (Stage 1)

| ID | Requirement |
| --- | --- |
| FR-P3-01 | The application connects to the database as a role that **cannot bypass row-level security**. The role owns no table and holds only the privileges the running product uses. |
| FR-P3-02 | Migrations, ingest and member seeding connect as a separate administrative role under its own environment variable. The application role holds no DDL privilege. |
| FR-P3-03 | Row-level security is **enabled and forced** on every member-scoped table: `members`, `member_accumulators`, `member_claims`, `member_prior_authorizations`, `member_appointments`. Forced, because a policy that the table owner silently bypasses is not a control. |
| FR-P3-04 | Each policy compares the row's member id against an identity carried on the connection. That identity is set from the session row and from nowhere else - never from the question, the prompt, or a request parameter. |
| FR-P3-05 | The identity is set **transaction-locally**. The database is reached through a session-mode pooler, so a connection returned to the pool must carry no member identity into the next request that borrows it. |
| FR-P3-06 | A connection with no identity set reads **zero** member rows. Absence of identity is not a wildcard. |
| FR-P3-07 | `login_codes` and `member_sessions` are exempt from row-level security, because the sign-in path reads them to discover who the member is, before an identity exists. They are protected by privilege instead: only the application role may read or write them. The exemption is recorded with its reason and asserted by the schema check, so it reads as a decision rather than an omission. |
| FR-P3-08 | Application-layer scoping stays. Every `where member_id = $1` in `loadMemberRecord` remains exactly as it is. Row-level security becomes the enforcement point; the query clause becomes defence in depth. |
| FR-P3-09 | The migration is reversible. A companion down script drops the policies, revokes the grants and returns the schema to its prior state, and is executed once against a real database. |
| FR-P3-10 | A member-scoped table added later **without** a policy fails a schema check rather than shipping unprotected. The check enumerates tables carrying a `member_id` column and asserts a policy on each. |
| FR-P3-11 | The proof connects to the database directly in one member's identity and attempts to read another member's rows, **with no application code in the path**. Anything routed through `loadMemberRecord` tests the application, not the policy. |
| FR-P3-12 | Every P2 authenticated flow continues to work unchanged after the policies apply: sign in, ask a record question, ask a question spanning record and documents, sign out. |

### 4.2 Minimum-necessary access (Stage 2)

| ID | Requirement |
| --- | --- |
| FR-P3-13 | A member's record is read **only when the question needs it**. `needsMemberData` already decides whether a signed-out member is asked to sign in; the same call decides whether a read happens at all. Being signed in is not a reason to read. |
| FR-P3-14 | When a topic is detected, the read is limited to the columns that topic requires. No `select *` on a member-scoped table. |
| FR-P3-15 | The router adds its `member` path on the same condition as the read. Today it adds the path whenever a member is identified, which is the same defect stated at the routing layer. |
| FR-P3-16 | The gate and the read cannot disagree, because they are the same rule evaluated once per turn. A change to the rule changes both. |

### 4.3 Audit log (Stage 2)

| ID | Requirement |
| --- | --- |
| FR-P3-17 | Every authenticated turn writes **exactly one** audit record: which member, which session, what was asked, which fields were read, when, and the outcome. |
| FR-P3-18 | The record names each field read as its column plus the business id of the row it came from, for example `member_claims.member_owes @ CLM-0031`. The column alone cannot distinguish which of three claims was read; the row id locates it without disclosing it. |
| FR-P3-19 | The record holds **no field contents**. A claim id locates a row. A claim amount is the thing being protected and never appears. |
| FR-P3-20 | An authenticated turn that refuses, or that is gated for a login, is audited too, with the refusal as its outcome. A read that did not happen is recorded as a read that did not happen. |
| FR-P3-21 | The audit table is append-only from the application. The application role holds `insert` and `select` and **no** `update` or `delete`, enforced by grant, and no code path issues either statement. |
| FR-P3-22 | Given an audit record, the fields it names can be replayed against the citations of the answer it describes, and they match. An answer citing a field the audit does not name is a defect in one of the two. |
| FR-P3-23 | The question stored in the audit record is redacted by the existing `FR-31` identifier redaction before it is written, exactly as the turn log is. |
| FR-P3-24 | An expired session reads no member data and says so in plain language, naming the way back in. It does not fail as an error and does not silently answer as though signed out. |

### 4.4 Real-PHI writeup (Stage 3)

| ID | Requirement |
| --- | --- |
| FR-P3-25 | A document states what changes when member records stop being synthetic. It covers, at minimum: BAA-eligible model tier and whether the current deployment already satisfies it, zero-data-retention configuration, encryption in transit and at rest, role-based access control, disclosure accounting, retention and deletion, incident response, and identity proofing. |
| FR-P3-26 | Every control names **what exists today versus what would have to be added**. A control that is already met says so and says why. |
| FR-P3-27 | The identity-proofing gap is stated explicitly: an emailed code is adequate for reads of synthetic data and **inadequate** for a write to a real record. |
| FR-P3-28 | The document states which parts of Stages 1 and 2 carry over unchanged and which would need strengthening. |
| FR-P3-29 | Every regulatory claim traces to `docs/research-init.md` or to a named CMS or HIPAA source. **No invented requirements.** Omitting a real requirement is acceptable; inventing a plausible one is not, and would undermine every other claim in the deliverable. |
| FR-P3-30 | The document answers "what if this happened" for at least three scenarios: a disclosure, a lost session, and an audit request. |

### 4.5 Spanish (Stage 4)

| ID | Requirement |
| --- | --- |
| FR-P3-31 | The Spanish Evidence of Coverage, Summary of Benefits and Annual Notice of Change are ingested for every indexed plan. Every chunk carries a language. |
| FR-P3-32 | Retrieval is scoped by language **before ranking**, the same way plan scope is, rather than filtered afterwards. |
| FR-P3-33 | A Spanish question never retrieves an English chunk, and an English question never retrieves a Spanish one. The single exception is the drug list, under FR-P3-36. |
| FR-P3-34 | Language is detected on the first turn by the existing `FR-24` detector, held for the session, and overridable by a control that defaults to what was detected rather than to English. |
| FR-P3-35 | Speech-to-text is told which language to expect, and spoken answers use a Spanish voice. A Spanish answer read aloud in an English voice is not an answer this audience can use. |
| FR-P3-36 | **The drug list is published in English only.** A Spanish drug question is answered in Spanish, cites the English drug list, and states plainly that the list exists only in English. The tier is the answer the member came for and refusing it would be a worse failure than the language mismatch. |
| FR-P3-37 | Citations render the Spanish document names. A member who reads Spanish is pointed at the document they can read. |
| FR-P3-38 | **No answer is produced by translating an English answer.** Every claim comes from a Spanish source, or from the drug list under FR-P3-36. Translation would produce an uncited claim in a language no source document supports. |
| FR-P3-39 | The two-column Summary of Benefits split works on the Spanish documents, which carry the same two-plan layout as the English ones. |
| FR-P3-40 | Cost answers agree between the English and Spanish corpora for the same question and plan, asserted on at least five amounts. A disagreement is a **corpus defect to be reported**, never a difference to be reconciled in the prompt. |
| FR-P3-41 | The golden set gains Spanish cases, and faithfulness is reported **per language** rather than pooled. A pooled figure would let Spanish fail behind an English average. |
| FR-P3-42 | `FR-24` is amended. The English-only refusal is replaced for Spanish and retained unchanged for every other language. |
| FR-P3-43 | Refusals, guardrail responses, the staleness notice and the login copy exist in Spanish. A Spanish question that hits a guardrail must not fall back to an English refusal. |
| FR-P3-44 | Record-sourced answers work in Spanish. The stored values are language-neutral; the prose around them and the field labels are Spanish. |

### 4.6 Mobile layout (Stage 5)

| ID | Requirement |
| --- | --- |
| FR-P3-45 | Every surface is usable on a phone down to 360 CSS pixels wide, with the floor held at an iPhone 14 Pro: 393x852. No content is clipped, and no page scrolls horizontally. |
| FR-P3-46 | Below the phone breakpoint the assistant is the full page and the panel is never offered. The launcher opens the page directly, and a panel left open while the window narrows becomes the page rather than a clipped overlay. |
| FR-P3-47 | The breakpoint is one constant, shared by the CSS and the code that switches layout, so the two cannot disagree. |
| FR-P3-48 | On a phone the controls sit in the assistant header rather than a side rail, and the way back to the landing page stays visible without scrolling. |
| FR-P3-49 | The human path stays on screen at all times on a phone, as it does on every other size. It is never moved behind a menu, and never duplicated to compensate. |
| FR-P3-50 | Primary navigation is never hidden behind a menu control. |
| FR-P3-51 | In voice mode the microphone is centred and full size on a phone, with its instruction beneath rather than beside it. |
| FR-P3-52 | The conversation is the largest region on the screen. Chrome that reserves space it is not using yields it. |

### 4.7 Caching (Stage 6)

> **Promoted from P4-01**, which `claude/srs.md` §8 and `claude/srs-p2.md` §8 both list as deferred. Those documents stay frozen as the requirements their releases were built against; the promotion is recorded here. `docs/ideas.md` P4-01 also warns that at demo volume caching "changes nothing" and that a loose similarity threshold "collides two similar questions with different copays and returns a wrong answer". Both warnings shaped FR-P3-54.

| ID | Requirement |
| --- | --- |
| FR-P3-53 | Every cache is a pure optimisation. Emptying all of them changes no answer, only the time taken to produce one. |
| FR-P3-54 | The answer cache is keyed on the **exact** normalised question within its scope: corpus snapshot, contract, plan, plan year and language. Never on similarity. Two questions one word apart can differ by ten dollars. |
| FR-P3-55 | A turn carrying a member id is never read from or written to any cache. It is the only way one member's record could reach another, and a cached answer would make the access log record a read that never happened. |
| FR-P3-56 | Query embeddings are cached on the exact text and the embedding model. A different model is a different vector space and must not serve the old one's vectors. |
| FR-P3-57 | Only an answered turn is cached. A refusal costs no generation, and a failure is never served twice. |
| FR-P3-58 | Synthesised audio is cached in the same store, keyed on text, voice and provider. Not on a container filesystem, which is per-instance and lost on restart. |
| FR-P3-59 | A cached turn is recorded in the turn log with its provider as `cache`, so a hit cannot be mistaken for a model call. |
| FR-P3-60 | Re-indexing invalidates the answer cache by construction: the snapshot id is part of the key, so a new corpus cannot hit an old entry. |
| FR-P3-61 | A cache read or write that fails never fails a turn. A cache that cannot be reached is a slower product, not a broken one. |
| FR-P3-62 | Ingest clears the answers cached against the snapshot it writes, whether the run succeeds or fails. FR-P3-60 covers a re-ingest under a **new** id; this covers re-running into the **same** id, where the chunks change and the key does not. Embeddings and audio are not cleared: neither can go stale, and clearing them would re-pay a provider call for nothing. |

### 4.8 Feedback that goes somewhere (Stage 7)

| ID | Requirement |
| --- | --- |
| FR-P3-63 | A yes or a no is recorded against the turn it rates, with the time it was given. |
| FR-P3-64 | The answer the member read is stored with the turn, **except** when the turn carried a member id. That answer holds their record and this table has no policy over it, so it is kept out rather than written and protected. |
| FR-P3-65 | After a no, the member is offered four fixed reasons: not about my plan, not what I asked, hard to understand, I think this is covered. **Never a free-text box.** Identifier redaction catches a member id; it does not catch a condition someone types. The reason set is enforced by a database constraint, not only by the form. |
| FR-P3-66 | The no is recorded before the reason is asked. A reason is an offer, not a toll on saying the answer failed. |
| FR-P3-67 | Feedback analysis reads a view that excludes the session id. The turn keeps it, because the loop breaker counts consecutive refusals within a session, but nothing in a report about answers needs to know what else that visit asked. |
| FR-P3-68 | The store is **pseudonymous, not anonymous**, and is described that way. A session id links the questions in one visit. Claiming otherwise would be the kind of overstatement `docs/real-phi.md` exists to avoid. |
| FR-P3-69 | The operator report lists answers a member rated wrong, with the reason and the route, as candidate golden-set cases. That is the mechanism this project already uses to improve answers and gate regressions; there is no fine-tuning pipeline and none is implied. |

### 4.9 A transcript the member can keep (Stage 8)

> **The control already existed.** `window.print()` and the print stylesheet have shipped since P2 as FR-P2-20, and the browser dialog's "Save as PDF" destination was the export path. What no browser API offers is a way to steer that dialog to a file, so a download means generating the bytes.

| ID | Requirement |
| --- | --- |
| FR-P3-70 | The export control downloads a PDF file. It does not open the print dialog and rely on the member finding the right destination in it. |
| FR-P3-71 | The file is built on the device from the conversation already in memory. No transcript is sent to the server to be rendered. A signed-in member's answer holds their own record, and posting it back to a renderer would rebuild the transit path Stage 2 removed. |
| FR-P3-72 | Every turn on screen appears in the file: the question, the answer as its claims or its prose, any unanswered gaps, and the numbered source list. The numbers match the markers the member saw beside the claims. |
| FR-P3-73 | The file carries its own context: the plan the answers were scoped to, the date the plan documents were collected, the date it was saved, the synthetic-data notice, and the Member Services number. A saved page leaves the application behind and may be read by a doctor or a family member who never saw it. |
| FR-P3-74 | When any turn in the file cites the member's own record, the first page says so. The file sits in a downloads folder on a possibly shared device. |
| FR-P3-75 | The file's chrome is in the language the conversation was held in, on the same authored-copy rule as the panel. FR-P3-43. |
| FR-P3-76 | The PDF library is fetched only when the control is pressed. A member who never exports pays none of its bytes on a slow connection. |
| FR-P3-77 | The print stylesheet stays and remains the fallback. If the file cannot be built, the member is told in a sentence and the print view opens instead of nothing happening. |

### 4.10 Comments that earn their place, and a documented corpus (Stage 9)

> Two jobs under one heading. The first enforces `CLAUDE.md` §5 across code written before it was enforced; the second answers the question a reader of this repository asks first, which is where the documents came from.

| ID | Requirement |
| --- | --- |
| FR-P3-78 | A comment says **why**, in at most 15 words. Two lines are allowed only where the code looks wrong but is right and the mistake has already been made once. |
| FR-P3-79 | No comment carries a requirement id, a decision id, a stage number or a release. Code outlives the plan that produced it, and a reader who cannot open the plan is left with a dead reference. |
| FR-P3-80 | No comment restates the line beneath it, and none describes code it does not sit on. |
| FR-P3-81 | The sweep changes no behaviour. The full suite and the typecheck are the proof, and they run before and after. |
| FR-P3-82 | The README states where every corpus document came from, how it was fetched, what converted it, how it was split, and how much of it reached the index. |
| FR-P3-83 | Every corpus figure published is measured from the snapshot and the database on the day it is written, never estimated. |

---

## 5. Acceptance Scenarios

### Row-level security

```gherkin
Scenario: [FR-P3-11] one member's session cannot read another member's rows
  Given a direct database connection as the application role
  And the connection identity is set to member 1
  When it selects from member_claims where member_id = 2
  Then zero rows are returned
  And no application code was in the path
```

```gherkin
Scenario: [FR-P3-03] the policy holds on every member-scoped table
  Given the same connection in member 1's identity
  When it selects every row of members, member_accumulators, member_claims,
       member_prior_authorizations and member_appointments
  Then every row returned belongs to member 1
```

```gherkin
Scenario: [FR-P3-06] an unidentified connection reads nothing
  Given a connection as the application role with no identity set
  When it selects from any member-scoped table
  Then zero rows are returned
```

```gherkin
Scenario: [FR-P3-01] the application role cannot bypass the policies
  Given the role the application connects as
  When its attributes are read from the database
  Then rolbypassrls is false
  And it owns none of the member-scoped tables
```

```gherkin
Scenario: [FR-P3-05] a pooled connection carries no identity into the next request
  Given a request that set member 1's identity and completed
  When the pooler hands that server connection to the next request
  Then no identity is set on it
  And a member-scoped select returns zero rows
```

```gherkin
Scenario: [FR-P3-10] a new member-scoped table without a policy fails the check
  Given a table carrying a member_id column and no policy
  When the schema check runs
  Then it fails and names the table
```

```gherkin
Scenario: [FR-P3-09] the migration rolls back
  Given the policies and the role are applied
  When the down script runs
  Then row-level security is disabled on every table it enabled it on
  And the schema matches its prior state
```

```gherkin
Scenario: [FR-P3-12] the authenticated flow still works
  Given the policies are applied
  When a member signs in and asks what their last claim cost
  Then the answer cites their own record and field
  And it names no other member's claim
```

### Minimum-necessary access

```gherkin
Scenario: [FR-P3-13] a public question from a signed-in member reads no record
  Given a signed-in member
  When they ask "what is my specialist copay"
  Then no member-scoped table is queried
  And the answer cites the plan documents only
```

```gherkin
Scenario: [FR-P3-14] a claim question reads claim fields and nothing else
  Given a signed-in member
  When they ask "what did my last claim cost"
  Then the executed queries touch member_claims only
  And they name the columns the answer uses rather than selecting every column
```

```gherkin
Scenario: [FR-P3-16] the gate and the read cannot disagree
  Given any question
  When the same question is asked signed out and then signed in
  Then it is gated in the first case exactly when a record is read in the second
```

### Audit log

```gherkin
Scenario: [FR-P3-17] one authenticated answer writes one audit record
  Given a signed-in member
  When they ask a question about their record
  Then exactly one audit record is written
  And it names the member, the session, the fields read, the time and the outcome
```

```gherkin
Scenario: [FR-P3-19] an audit record holds no protected value
  Given an answer that read a claim amount of $47.50
  When the audit record for it is read
  Then it names member_claims.member_owes and the claim id
  And the string "47.50" does not appear anywhere in the record
```

```gherkin
Scenario: [FR-P3-20] a refused authenticated question is audited
  Given a signed-in member
  When they ask something the record cannot answer and are refused
  Then an audit record is written with the refusal as its outcome
  And its field list is empty
```

```gherkin
Scenario: [FR-P3-21] the application cannot alter an audit record
  Given an existing audit record
  When an update or a delete is attempted as the application role
  Then the database rejects it
  And no application code path issues either statement
```

```gherkin
Scenario: [FR-P3-22] an audit record reconstructs the answer's citations
  Given an answered record question and its audit record
  When the fields named in the record are compared with the answer's citations
  Then every cited field appears in the audit record
  And every audited field was available to the answer
```

```gherkin
Scenario: [FR-P3-24] an expired session says so
  Given a session past its absolute lifetime
  When the member asks about their record
  Then no member data is read
  And they are told the session ended and how to sign in again, in plain language
```

### Spanish

```gherkin
Scenario: [FR-P3-31] a Spanish question returns a Spanish answer from a Spanish source
  Given the Spanish corpus is ingested for plan H5141-004
  When the member asks "cual es mi copago por una visita al especialista"
  Then the answer is in Spanish
  And every citation names a Spanish document
```

```gherkin
Scenario: [FR-P3-40] the same amount comes back in both languages
  Given the same question asked in English and in Spanish for the same plan
  When both answers are produced
  Then the amounts match
  And a mismatch is reported as a corpus defect rather than reconciled
```

```gherkin
Scenario: [FR-P3-33] language scoping holds in both directions
  Given a Spanish question
  When retrieval runs
  Then no English chunk is returned
  And the reverse holds for an English question
```

```gherkin
Scenario: [FR-P3-36] a Spanish drug question is answered, not refused
  Given the drug list exists only in English
  When a member asks in Spanish what tier a named drug is on
  Then the tier is stated in Spanish
  And the citation names the English drug list
  And the answer says the drug list is published in English only
```

```gherkin
Scenario: [FR-P3-38] no answer is a translated English answer
  Given a Spanish question with no Spanish source for it
  When no Spanish chunk clears the confidence floor
  Then the assistant refuses in Spanish and offers a person
  And it does not answer from English chunks
```

```gherkin
Scenario: [FR-P3-41] Spanish faithfulness is reported on its own
  Given the golden set contains Spanish cases
  When the eval runs
  Then faithfulness is reported per language
  And a Spanish failure cannot be hidden by the English average
```

---

### Mobile layout

```gherkin
Scenario: [FR-P3-45] nothing is clipped at the floor viewport
  Given a viewport of 393 by 852
  When the landing page, the assistant and voice mode are each rendered
  Then no element's content is wider than the frame that holds it
  And the document does not scroll horizontally
```

```gherkin
Scenario: [FR-P3-46] the panel is not offered on a phone
  Given a viewport below the phone breakpoint
  When the member taps the launcher
  Then the assistant opens as the full page
  And no expand control is shown, because there is nothing to expand to
```

```gherkin
Scenario: [FR-P3-49] the human path survives the smallest screen
  Given a viewport of 393 by 852
  When the assistant is open in either mode
  Then "Talk to a person" is on screen without scrolling
```

---

### Caching

```gherkin
Scenario: [FR-P3-54] a near-identical question is not a cache hit
  Given an answer cached for "what is my specialist copay"
  When a member asks "what is my out-of-network specialist copay"
  Then the cache does not answer it
  And the two keys differ
```

```gherkin
Scenario: [FR-P3-55] a signed-in member's turn is never cached
  Given a signed-in member asking about their own record
  When the turn completes
  Then nothing is written to the answer cache
  And no later turn is served from it
```

```gherkin
Scenario: [FR-P3-60] re-indexing invalidates the answers
  Given answers cached against one corpus snapshot
  When the corpus is re-ingested under a new snapshot id
  Then no cached answer is served
```

---

### Feedback

```gherkin
Scenario: [FR-P3-64] a signed-in member's answer is not stored
  Given a signed-in member whose answer names a claim amount
  When the turn is written to the log
  Then the answer column is null
  And the rating can still be given and recorded
```

```gherkin
Scenario: [FR-P3-65] the endpoint accepts no reason it was not offered
  Given a feedback request carrying free text as its reason
  When it is handled
  Then the reason is dropped rather than stored
  And the database would reject it in any case
```

### Transcript export

```gherkin
Scenario: [FR-P3-72] the numbers in the file are the numbers on the screen
  Given an answer whose second claim carries the marker [2]
  When the transcript is built
  Then the source list in the file numbers that source [2]
```

```gherkin
Scenario: [FR-P3-74] a file holding member data says so on its first page
  Given a conversation with one answer citing "Your member record"
  When the transcript is built
  Then the first page carries the notice that it contains member-record data
  And a conversation with no such citation carries no notice
```

```gherkin
Scenario: [FR-P3-77] the export fails without failing the member
  Given a device that cannot fetch the PDF library
  When the member presses the export control
  Then a sentence says the file could not be made
  And the print view opens
```

### Comments and corpus documentation

```gherkin
Scenario: [FR-P3-79] a comment cannot carry a dead reference
  Given any comment in the code, tests, migrations or stylesheets
  When the comment gate runs
  Then it contains no requirement id, decision id, stage or phase
```

```gherkin
Scenario: [FR-P3-81] the sweep is behaviour-preserving
  Given the suite passing before the sweep
  When every comment has been rewritten or removed
  Then the same suite passes with the same count, and the typecheck is clean
```

```gherkin
Scenario: [FR-P3-83] a published corpus figure is a measured one
  Given the README states a chunk count
  When the database is queried on the day it is written
  Then the two agree
```

---

## 6. Non-Functional Requirements

| ID | Requirement | Gate |
| --- | --- | --- |
| NFR-P3-19 | The comment rule is a test, not a habit. A comment carrying a requirement id, a decision id or a stage fails CI. | CI |
| NFR-P3-18 | The export adds nothing to the bundle a member downloads to ask a question. Verified from the build output: the PDF library is its own chunk. | Build |
| NFR-P3-17 | No feedback surface accepts free text. Asserted by test over the markup as well as the endpoint. | CI |
| NFR-P3-15 | Emptying every cache changes no answer. The caches are measured on latency only, never on correctness. | Asserted by test |
| NFR-P3-16 | Cache hit and miss counts are recorded per entry, so the hit rate is measured rather than assumed. | Recorded |
| NFR-P3-13 | The floor is an iPhone 14 Pro, 393x852. Layout is verified by rendering at that size and looking, not by reading the stylesheet. | Screenshot run, recorded |
| NFR-P3-14 | Every target stays at 44x44 CSS pixels and every reading surface at its type floor on a phone. Chrome may shrink; controls and body text may not. | Static assertion |
| NFR-P3-01 | The row-level security proof runs against a real database with the application bypassed, as a step in the existing CI job that already holds `DATABASE_URL`. A control that only runs on one laptop is not a control. | CI, fails on any leaked row |
| NFR-P3-02 | No P1 or P2 metric regresses. The existing regression gate covers faithfulness, structural compliance, refusal rate and the three buckets. | CI |
| NFR-P3-03 | The number of member columns read per authenticated answer is measured before and after Stage 2 and reported. A minimum-necessary claim with no measurement behind it is an assertion. | Measured, reported |
| NFR-P3-04 | No value from a protected column appears in an audit record, asserted by test rather than by reading the code. | CI |
| NFR-P3-05 | **Zero real PHI, at any version** (D-047). Unchanged and still binding. Stage 3 is a description of what would change, not a step toward it. | Schema constraint plus test |
| NFR-P3-06 | Spanish faithfulness is gated at the same floor as English, reported separately. | CI |
| NFR-P3-07 | Row-level security and audit writes add measurable latency. The before and after are measured against `NFR-PERF-02` and reported; a regression is a finding to state, not to hide. | Measured, reported |
| NFR-P3-08 | Zero monetary cost. Spanish ingestion adds embedding calls within the existing Azure allocation; no new external service. | - |
| NFR-P3-09 | The language control meets WCAG 2.2 AA and the 44x44 target minimum, and is reachable by keyboard. | Static assertion |
| NFR-P3-10 | The application role's password is an environment variable and never enters the repository. The existing secret scan covers it. | CI |
| NFR-P3-11 | The Stage 1 rollback is executed once against a real database and the result recorded. A reversible migration nobody reversed is untested. | Recorded |
| NFR-P3-12 | Every Spanish string shown to a member is written by a person, not machine-translated at runtime. Interface copy is authored; answers come from Spanish source documents. | Reviewed |

---

## 7. Hard Constraints

- **No real member data, ever.** D-047. P3 changes nothing about this and Stage 3 exists partly to say so in writing.
- **Cite or refuse.** P1 FR-05, unchanged, and it extends to Spanish without modification. A Spanish claim needs a Spanish citation, or the English drug list under FR-P3-36 with the mismatch stated.
- **The regulatory line.** P1 FR-17 stands: inform, never adjudicate, never imply a coverage determination, never give clinical advice.
- **No invented regulatory requirements.** Stage 3's single largest failure mode. Every claim traces to a source or is omitted.
- **The public deployment stays public.** Nothing in P3 gates a question a signed-out member can ask today.
- **Application scoping is not removed.** RLS becomes the enforcement point and the existing `where` clauses stay as defence in depth.
- **Zero monetary cost.** Free tier, open source, or local.
- **`claude/srs.md` and `claude/srs-p2.md` stay frozen.**

---

## 8. Explicit Non-Goals

- **Retention policy and disclosure accounting as code.** Described in Stage 3, not built. At this scale they are policy, and implementing them against synthetic data would demonstrate nothing.
- **Row-level security over non-member tables.** `chunks`, `drugs` and `turns` are not member-scoped and gain no policy.
- **Delegated or caregiver access.** Unchanged from P2. There is no proxy login and RLS does not create the possibility of one.
- **Identity proofing beyond the emailed code.** Named as a gap in Stage 3, not closed.
- **Any language beyond English and Spanish.** Every other language keeps the FR-24 refusal.
- **Machine translation.** Not as a fallback, not for interface copy, not for answers.
- **A Spanish provider directory or drug list.** Neither is published in Spanish. FR-P3-36 handles the drug list; provider questions keep their P2 behaviour.
- **Encryption at rest beyond what Supabase already provides.** Described in Stage 3, not re-implemented.

---

## 9. Success Metric

A direct database query in one member's identity returns nothing for another member, every authenticated answer has an audit row naming the exact fields it read and no values, and the same copay question asked in Spanish returns the same amount as in English, cited to the Spanish Evidence of Coverage.

---

## 10. Open Questions

- [ ] Does the Supabase pooler accept a custom database role in session mode? The username format is `<role>.<project-ref>`, which should work, but this is load-bearing for all of Stage 1 and must be verified empirically the moment the role exists, before any policy is written.
- [ ] Does the existing voice provider chain offer a Spanish voice on its free tier, and does the speech-to-text tier accept a language hint? FR-P3-35 depends on both.
- [ ] Do the Spanish Summary of Benefits documents use the identical two-column layout as the English ones? Confirmed for the English set by measurement; the Spanish set must be measured the same way before FR-P3-39 is specified further.
- [ ] What does ingesting nine more documents cost in embedding calls, and does it stay inside the current Azure allocation?
- [ ] Is `turns.question` enough of an audit trail on its own, making the audit record's question column a duplicate? Resolve before Stage 2 writes a second copy of the same redacted string.
