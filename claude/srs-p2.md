# Software Requirements Specification - P2 (v1.1)

> **Scope of this document is `docs/ideas.md` P2, built as the eight stages of `claude/plan-p2.md`.** It is a companion to `claude/srs.md`, not a replacement. `claude/srs.md` stays frozen at its v1.1.0 as the requirements the v1.0.0 release was built against (D-050).
>
> Requirement ids are namespaced `FR-P2-NN` and `NFR-P2-NN` and do not collide with P1's `FR-NN` / `NFR-NN`. Where a P1 requirement still binds, it is cited by its P1 id.
>
> **FROZEN on completion of this pass.** Amend only by re-running `/spec-requirements` and bumping the version.

| Field        | Value                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Project      | Clover Member Assistant                                                                                                        |
| Version      | 1.0.0                                                                                                                          |
| Status       | Frozen                                                                                                                         |
| Last Updated | 2026-09-08                                                                                                                     |
| Covers       | `claude/plan-p2.md` stages 1-8, shipped as v1.1.0                                                                              |
| Sources      | `docs/ideas.md` P2-01 to P2-20, `claude/plan-p2.md`, `docs/call-drivers.md`, `claude/srs.md` v1.1.0, D-007, D-047 to D-052      |
| Predecessor  | `claude/srs.md` v1.1.0 (P1, frozen)                                                                                            |

---

## 1. Overview

v1.0.0 answers questions from public plan documents with a citation on every claim, and routes everything else to a person. It covers two of the four call drivers the case study names. The other two - a claim and a prior authorization - require knowing who the member is, so v1 could not touch them.

P2 does two things. It makes the public tier materially better: a second contract so plan scoping is demonstrably load-bearing, typed lookup where the source is a table rather than prose, an answer format built around the number the member came for, and the session surfaces that let a member leave and come back. Then it adds an authenticated tier over **synthetic member records only**, so the remaining two call drivers are answerable end to end.

The regulatory boundary from P1 is unchanged and still enforced by FR-17: the assistant informs, does not adjudicate coverage, does not imply a coverage determination, and gives no clinical advice. Reading a member's own stored claim status back to them is disclosure of a record, not adjudication of a claim.

**No real member data enters this system at any version** (D-047, amending D-001). Every member record in P2 is invented, labelled synthetic in schema, in seed and in output.

---

## 2. Personas

P1's two personas are unchanged. P2 adds a state, not a person: the Member is either signed out or signed in, and the product must be correct in both.

| Persona | Profile | Primary Need | What P2 changes |
| --- | --- | --- | --- |
| **Member, signed out** (primary) | As `claude/srs.md` §2. Clover Medicare Advantage enrollee, typically 65+, phone more often than desktop. | A specific, trustworthy answer about their plan, and a fast route to a person. | Answers arrive as a card with the amount dominant. Their conversation survives a closed tab. A question that needs their record gets a plain explanation and an offer to sign in, never a refusal and never a guess. |
| **Member, signed in** (primary) | The same person, having completed an emailed six-digit code inside the chat panel. | Their own claim, prior authorization and remaining balances, cited to the record and field. | Everything above, plus member-scoped answers. Session is visible in every state and endable in one tap. |
| **Caregiver** (secondary) | An adult child, spouse or paid carer acting for a member. Inside the CMS definition of communications. | An answer they can read, verify against its source, and act on or pass along. | Print output improves. **Auth grants them nothing.** There is no delegated access, no caregiver login, no proxy. A caregiver holding the member's device is indistinguishable from the member, which is why sign-out clears member-sourced turns (FR-P2-34). |

---

## 3. Jobs To Be Done

P1's nine jobs still stand (`claude/srs.md` §3). P2 adds six.

**Requiring identity** - the two call drivers v1 could not reach:

- **Check the status of a claim** they have already incurred.
- **Check the status of a prior authorization** they are waiting on.
- **Check how much of a benefit allowance or out-of-pocket maximum is left** this year.
- **See past appointments and who their assigned primary care provider is.**

**Not requiring identity:**

- **Return later and find the prior conversation**, rather than starting over or calling.
- **Print or share an answer with a caregiver**, with the citation intact.

One P1 job is explicitly **not** improved by P2. "Find an in-network provider or pharmacy, or check whether a named one is in network" continues to state that the directory is demonstration data and route to a person. D-051 records why: the corpus has no real provider directory, and precise structured search over invented rows produces a confident wrong answer about a member's doctor.

---

## 4. Functional Requirements

### 4.1 Plan identity and the second contract (Stage 1)

| ID | Requirement |
| --- | --- |
| FR-P2-01 | The corpus pipeline indexes more than one contract. H8010-002 Classic (HMO) is indexed alongside H5141-004 and H5141-007 (D-048). Scope is data, not hardcoded constants. |
| FR-P2-02 | Plan identity is a contract-and-plan pair carried as one typed value through corpus, retrieval, answering, turn log, eval and web (D-049). No layer reconstructs a contract from a string. |
| FR-P2-03 | Retrieval is scoped to the session's plan reference before ranking. A chunk belonging to any other plan reference is never returned, and this is asserted directly rather than inferred from answer correctness. |
| FR-P2-04 | The plan prompt stays lazy (P1 FR-10, D-022): a member may ask anything without setup, and only a question whose answer depends on the plan triggers the chips. Once a plan is known it is shown as persistent chrome with a control to change it. |
| FR-P2-05 | Changing plan mid-session re-scopes every subsequent answer and leaves prior answers in the transcript unaltered and still correctly attributed to the plan they were answered under. |
| FR-P2-06 | The golden set contains at least five paired questions that differ only by plan reference, with different expected answers per plan, hand-verified against both source documents. |

```yaml
PlanRef:
  contractId: string   # H5141, H8010
  planId: string       # 004, 007, 002
  planYear: number     # 2026
# Rendered for display as "Clover Health Choice (PPO)", never as a raw id.
# Rendered for citation as "H5141-004, plan year 2026".
```

### 4.2 Structured lookup and the router (Stage 2)

| ID | Requirement |
| --- | --- |
| FR-P2-07 | The formulary is ingested into typed rows - drug name, tier, plan reference, and any utilisation-management flags the source carries - in addition to remaining available to RAG for its prose sections. |
| FR-P2-08 | A named-drug tier question is answered by a typed query against those rows, and the answer cites the row it came from. |
| FR-P2-09 | A router selects between structured lookup and RAG on every turn, and logs its selection and its reason to the turn log. |
| FR-P2-10 | A question with both a structured and a prose half - "is this drug covered and how do I appeal a denial" - answers both halves and drops neither. |
| FR-P2-11 | Structured answers carry citations in the same shape as RAG answers, and satisfy P1 FR-05 cite-or-refuse identically. A structured claim without a citation is as impossible as a RAG claim without one. |
| FR-P2-12 | Provider search is **not** routed to structured lookup. Provider questions keep the P1 behaviour: state that the directory is demonstration data and offer a person (D-051). |

### 4.3 Answer card and freshness (Stage 3)

| ID | Requirement |
| --- | --- |
| FR-P2-13 | A cost answer renders as a card: one sentence of direct answer, the amount as the visually dominant element, the source line beneath. |
| FR-P2-14 | The card degrades to readable prose when the answer is not a single amount, without losing its citation. |
| FR-P2-15 | Every citation displays document, plan year and section. A citation lacking a plan year fails to render and the answer refuses, rather than rendering incomplete. (P1 already enforces this at the payload layer; P2 binds it at the render layer too.) |
| FR-P2-16 | The corpus ingestion date is recorded at ingest and is visible from the interface. |
| FR-P2-17 | When the wall-clock year is greater than the corpus plan year, every answer carries a plain-language warning that the plan year has changed and amounts may have changed with it. |

### 4.4 Session surfaces (Stage 4)

| ID | Requirement |
| --- | --- |
| FR-P2-18 | Conversation history persists in browser-local storage, is restored on return, and is clearable by the member. |
| FR-P2-19 | When storage is unavailable - a private window, storage disabled - history is simply absent. No crash, and no error surfaced to the member. |
| FR-P2-20 | A print stylesheet renders the transcript legibly with citations intact and no interface chrome. **Print-to-PDF through the browser is the export mechanism**; no file is generated in-app. |
| FR-P2-21 | Any single answer can be copied to the clipboard with its citation attached. |
| FR-P2-22 | Quick-reply chips offer the three commands from `docs/ideas.md` P2-06 - `help`, `talk to a person`, `start over` - plus two or three contextual follow-up questions after each answer, drawn from the same source document that answered it (this delivers P2-01). |
| FR-P2-23 | A static help panel is reachable from every state by keyboard, lists what can and cannot be asked, explains each control, and carries the member services phone number. It does not trap focus. |

### 4.5 Synthetic member records (Stage 5)

| ID | Requirement |
| --- | --- |
| FR-P2-24 | Five synthetic member records are defined in schema and seed. Every record is labelled synthetic in the schema itself, in the seed, and in any output derived from it. |
| FR-P2-25 | Each record is deep enough to answer at least four distinct question types, per the shape below. |
| FR-P2-26 | Member-scoped query functions take a member id and return only that member's rows. A query for member 1 never returns a row belonging to member 2, asserted directly. |
| FR-P2-27 | `npm run ask:member -- --id=<n> "<question>"` answers a member-specific question from that member's record at a terminal, before any authentication exists. |
| FR-P2-28 | A record-sourced claim cites the record and the field it came from, not a document. |
| FR-P2-29 | A combined question returns a plan-document citation and a record citation in one answer, each attributed to its own source. |

```yaml
Member:
  id: number
  synthetic: true          # column, not a comment. Always true.
  displayName: string
  email: string            # invented, except the one operator address (FR-P2-40)
  plan: PlanRef
  effectiveDate: date
Accumulators:
  outOfPocketMaximum: { limit: money, usedYtd: money }
  partDCoverageStage: enum  # deductible | initial | catastrophic
  allowances:               # remaining balance per supplemental benefit
    dental: { limit: money, remaining: money }
    otc: { limit: money, remaining: money }
    hearing: { limit: money, remaining: money }
    vision: { limit: money, remaining: money }
Claim:
  id: string
  serviceDate: date
  provider: string          # demo data
  serviceDescription: string
  billed: money
  planPaid: money
  memberOwes: money
  status: enum              # received | processing | paid | denied
PriorAuthorization:
  id: string
  requestedService: string
  requestedDate: date
  status: enum              # submitted | in_review | approved | denied
  decisionDate: date | null
Appointment:
  date: date
  provider: string          # demo data
  specialty: string
AssignedProvider:
  name: string              # demo data
  specialty: string
```

### 4.6 Email OTP authentication (Stage 6)

| ID | Requirement |
| --- | --- |
| FR-P2-30 | A member enters an email address and receives a six-digit numeric code, delivered by Resend on the free tier (D-052). |
| FR-P2-31 | The code expires 10 minutes after issue, is single-use, and is invalidated after 5 incorrect attempts. |
| FR-P2-32 | Code requests are rate-limited to 10 per email address per hour and 30 per IP address per hour, counted in the same Postgres mechanism P1 already uses for question rate limiting. |
| FR-P2-33 | The code field accepts a pasted value, satisfying WCAG 2.2 SC 3.3.8 Accessible Authentication. No cognitive-function test is imposed at any point in the flow. |
| FR-P2-34 | Login happens entirely inside the chat panel. No page navigation, and the conversation is intact and visible afterward. |
| FR-P2-35 | A successful login binds a session to exactly one member row. The session expires after 30 minutes idle or 8 hours absolute, whichever comes first. |
| FR-P2-36 | Session expiry produces a plain-language explanation of what happened and what to do, never a silent failure and never a raw error. |
| FR-P2-37 | A signed-in indicator naming the signed-in member is visible in every state of the interface. |
| FR-P2-38 | Sign-out is reachable in one tap, ends the session, and a subsequent member-specific question requires login again. |
| FR-P2-39 | Sign-out removes every turn citing a member record from local history. Turns citing only public documents survive. |
| FR-P2-40 | On the deployed build, one of the five members is seeded with an operator-controlled email address supplied by environment variable. The other four keep invented addresses that receive nothing. |
| FR-P2-41 | No code, session token or credential appears in any log, at any level, on any path. |

### 4.7 Login detection and member answering (Stage 7)

| ID | Requirement |
| --- | --- |
| FR-P2-42 | A question is **member-specific** if and only if answering it requires a value stored against that member. The test is where the answer lives, not how the question is worded: "what is my specialist copay" is a plan-document question and is never gated; "what did my last claim cost" is a record question and always is. |
| FR-P2-43 | A member-specific question from a signed-out member produces a plain-language explanation of why signing in is required and an inline offer to do so. It never refuses outright and never guesses an answer. |
| FR-P2-44 | A public question is never gated behind login. |
| FR-P2-45 | A member-specific question is never answered without a session. This is enforced structurally at the query layer - member-scoped queries are unreachable without a bound session - and not by the classifier alone. A classifier miss must not be able to disclose a record. |
| FR-P2-46 | After a successful login the member's original question is answered automatically, without re-typing. |
| FR-P2-47 | Cite-or-refuse (P1 FR-05) binds record-sourced claims unchanged. A record claim without a record-and-field citation is not rendered. |
| FR-P2-48 | Cross-member access is impossible at the application layer. Database-level enforcement is P3-01 and its absence is stated, not implied. |

### 4.8 Evaluation and deployment (Stage 8)

| ID | Requirement |
| --- | --- |
| FR-P2-49 | The golden set is extended with `docs/call-drivers.md` bucket B drivers, each with its expected record source pinned by hand, and with cases exercising both directions of the login classifier. |
| FR-P2-50 | A held-out routing set of at least 30 hand-labelled cases is evaluated as a classification problem and its confusion matrix is reported. |
| FR-P2-51 | One evaluation run reports P1 and P2 metrics together in a single output. |
| FR-P2-52 | CI fails on any regression in a P1 metric, and on any breach of the P2 gates in §6. |
| FR-P2-53 | The deployed system completes a full signed-out to signed-in to answered flow. |

---

## 5. Acceptance Scenarios

### Plan scoping

```gherkin
Scenario: [FR-P2-06] the same question returns different amounts under two contracts
  Given the corpus indexes H5141-004 and H8010-002
  When the member asks "what is my copay for a specialist visit" under each plan
  Then each answer states that plan's own amount
  And each amount matches its own source document, verified by hand
```

```gherkin
Scenario: [FR-P2-03] retrieval never crosses a plan boundary
  Given a session scoped to H8010-002
  When any question is retrieved for
  Then no returned chunk carries a plan reference other than H8010-002
```

```gherkin
Scenario: [FR-P2-05] switching plans does not rewrite history
  Given a member asked a copay question under H5141-004 and received "$10"
  When the member switches to H8010-002 and asks the same question again
  Then the new answer carries H8010-002's amount
  And the earlier answer still reads "$10" and still cites H5141-004
```

```gherkin
Scenario: [FR-P2-04] a process question still needs no plan
  Given a member with no plan selected
  When the member asks "how do I file an appeal"
  Then the answer is given without the plan chips appearing
```

### Router

```gherkin
Scenario: [FR-P2-08] a drug tier answer comes from a table row
  Given the formulary is ingested as typed rows
  When the member asks "what tier is ORSERDU on"
  Then the answer states the tier from a row
  And the citation names that row
```

```gherkin
Scenario: [FR-P2-09] a rules question is not sent to structured lookup
  When the member asks "how do I request a formulary exception"
  Then the router selects RAG
  And its selection and reason are written to the turn log
```

```gherkin
Scenario: [FR-P2-10] a two-part question loses neither part
  When the member asks "is Eliquis covered and how do I appeal if it is denied"
  Then the answer states the tier from a row
  And the answer states the appeal process from a document
  And both citations are present
```

```gherkin
Scenario: [FR-P2-12] provider questions still route to a person
  When the member asks "is Dr Alvarez in my network"
  Then the assistant states the provider directory is demonstration data
  And offers a person
  And makes no claim about network status
```

### Answer card and freshness

```gherkin
Scenario: [FR-P2-13] the amount is the dominant element
  When a single-amount cost answer renders
  Then the amount is the largest text in the card
  And the source line names document, plan year and section
```

```gherkin
Scenario: [FR-P2-15] an incomplete citation refuses rather than renders
  Given an answer payload whose citation carries no plan year
  When rendering is attempted
  Then nothing is rendered as an answer
  And the member sees a refusal with an offer of a person
```

```gherkin
Scenario: [FR-P2-17] the plan year boundary raises a warning
  Given a corpus for plan year 2026
  When the system clock reads 2027-01-02
  Then every answer carries a plain-language plan-year-changed warning
```

```gherkin
Scenario: [FR-P2-14] a prose answer keeps its citation
  When the member asks "how does the out-of-network benefit work"
  Then the answer renders as prose rather than a card
  And it still carries document, plan year and section
```

### Session surfaces

```gherkin
Scenario: [FR-P2-18] history survives a browser restart
  Given a member asked two questions and closed the browser
  When the member returns to the page
  Then both questions and both answers are present in the transcript
```

```gherkin
Scenario: [FR-P2-19] history is absent, not broken, without storage
  Given browser storage throws on write
  When the member asks a question and receives an answer
  Then the answer renders normally
  And no error is surfaced to the member
  And on reload the transcript is empty
```

```gherkin
Scenario: [FR-P2-18] clearing history actually clears it
  Given a transcript is stored locally
  When the member clears history
  Then the underlying storage key is absent on inspection
```

```gherkin
Scenario: [FR-P2-23] the help panel does not trap focus
  Given the help panel is open
  When the member tabs past its last focusable element
  Then focus returns to the interface behind it
```

### Member records

```gherkin
Scenario: [FR-P2-27] a record question answers at a terminal
  When "npm run ask:member -- --id=3 'what is the status of my prior authorization'" runs
  Then the answer states member 3's prior authorization status
  And cites the record and the field
```

```gherkin
Scenario: [FR-P2-26] one member's query cannot reach another's rows
  Given members 1 and 2 both have claims
  When member 1's claim query runs
  Then no row belonging to member 2 is returned
```

```gherkin
Scenario: [FR-P2-29] a combined answer carries two kinds of citation
  When the member asks "what is my dental allowance and how much have I used"
  Then the limit is cited to a plan document
  And the remaining balance is cited to a record field
```

```gherkin
Scenario: [FR-P2-24] synthetic labelling is visible, not just intended
  When any member record is rendered in any output
  Then it is marked as demonstration data
```

### Authentication

```gherkin
Scenario: [FR-P2-30] a seeded member receives a code
  Given member 5 is seeded with the operator address
  When that address is entered in the login field
  Then a six-digit code is delivered to it
```

```gherkin
Scenario: [FR-P2-31] an expired code is rejected
  Given a code issued 11 minutes ago
  When it is submitted
  Then it is rejected with a plain-language message offering a new code
```

```gherkin
Scenario: [FR-P2-31] a used code cannot be reused
  Given a code that has already completed a login
  When it is submitted again
  Then it is rejected
```

```gherkin
Scenario: [FR-P2-32] repeated requests are throttled
  Given 10 codes have been requested for one address within the hour
  When an eleventh is requested
  Then no email is sent
  And the member sees a plain-language message to wait
```

```gherkin
Scenario: [FR-P2-34] the conversation survives login
  Given a signed-out member has asked three questions
  When the member completes login inside the panel
  Then all three questions and answers are still visible
  And no page navigation occurred
```

```gherkin
Scenario: [FR-P2-35] an idle session expires
  Given a session with no activity for 31 minutes
  When a member-specific question is asked
  Then the session is rejected
  And a plain-language explanation is shown with an offer to sign in again
```

```gherkin
Scenario: [FR-P2-39] sign-out removes member-sourced turns only
  Given a transcript with one copay answer and one claim answer
  When the member signs out
  Then the copay answer remains in local storage
  And the claim answer is absent from local storage
```

```gherkin
Scenario: [FR-P2-41] codes never reach the logs
  Given a full login lifecycle has run
  When every log line produced is inspected
  Then no six-digit code and no session token appears in any of them
```

### Login detection

```gherkin
Scenario: [FR-P2-44] a possessive pronoun does not gate a public question
  Given a signed-out member
  When the member asks "what is my specialist copay"
  Then the answer is given from the plan document
  And no login is offered
```

```gherkin
Scenario: [FR-P2-43] a record question offers login rather than refusing
  Given a signed-out member
  When the member asks "what did my last claim cost"
  Then the assistant explains that this answer lives in their record
  And offers to sign in inside the panel
  And makes no claim about the amount
```

```gherkin
Scenario: [FR-P2-45] the query layer refuses even when the classifier does not
  Given the classifier has wrongly labelled a record question as public
  When the answering path attempts a member-scoped query with no session
  Then the query is refused at the query layer
  And no member data is returned
```

```gherkin
Scenario: [FR-P2-46] the original question answers itself after login
  Given a signed-out member asked "what is the status of my prior authorization"
  And accepted the login offer
  When login completes
  Then the prior authorization status is answered without the member retyping anything
```

### Evaluation

```gherkin
Scenario: [FR-P2-51] one run reports both generations of metric
  When the evaluation harness runs against the deployed build
  Then the report carries P1 faithfulness, structural validity and refusal rate
  And P2 router accuracy, classifier accuracy in both directions, and bucket B coverage
```

```gherkin
Scenario: [NFR-P2-02] a single false negative fails the build
  Given the extended golden set includes member-specific questions asked signed out
  When any one of them is answered rather than gated
  Then CI fails
```

---

## 6. Non-Functional Requirements

| ID | Requirement | Gate |
| --- | --- | --- |
| NFR-P2-01 | Faithfulness on the extended golden set stays at or above 0.90. | CI, fails below |
| NFR-P2-02 | Login-classifier **false negatives are zero-tolerance**. A single member-specific question answered without a session fails CI. False positives - a public question wrongly gated - are reported separately and gated at 95% correct. | CI, both directions reported separately, never aggregated |
| NFR-P2-03 | Router selection is at least 90% correct across the held-out set, **and misrouting a drug-tier question to RAG is zero-tolerance**. Aggregate accuracy alone would let the one failure D-007 exists to prevent pass. | CI, confusion matrix reported |
| NFR-P2-04 | No P1 metric regresses: faithfulness 1.000, structural compliance 100%, refusal rate at or below 20%, bucket A 27/30, B 8/8, C 10/10 as at v1.0.0. | CI |
| NFR-P2-05 | Every new surface meets WCAG 2.2 AA. The login flow additionally gets a keyboard-only pass and a screen-reader pass, because it is the highest-friction surface in the product for this audience. | Manual pass, recorded |
| NFR-P2-06 | The dominant amount in the answer card meets AA contrast against its background at its rendered size. | Static assertion |
| NFR-P2-07 | **Zero real PHI, at any version** (D-047). Every member record is synthetic and labelled as such in schema, seed and output. | Schema constraint plus test |
| NFR-P2-08 | Zero monetary cost. Resend free tier only: 3,000 emails per month, 100 per day. Rate limits in FR-P2-32 are set below that ceiling. | - |
| NFR-P2-09 | New paths do not regress P1 NFR-PERF-02, time to first token at or under 2000ms unthrottled. Structured lookup is expected to beat RAG on latency; if it does not, that is a finding to report, not to hide. | Measured, reported |
| NFR-P2-10 | Member scoping is enforced at the application layer only. Row-level security and audit logging are P3-01. This residual risk is stated in the deliverable, not implied by its absence. | Stated |
| NFR-P2-11 | Quick-reply chips and every new control meet the 44x44 CSS pixel target minimum. | Static assertion |
| NFR-P2-12 | Every secret is an environment variable. The existing secret scan covers the Resend key shape and the operator address is not committed. | CI |

---

## 7. Hard Constraints

- **No real member data, ever.** D-047. This binds every version, not just v1.
- **Cite or refuse.** P1 FR-05 is unchanged and extends unmodified to record-sourced claims. There is no third path and a database row does not earn one.
- **The regulatory line.** P1 FR-17 stands: inform, never adjudicate, never imply a coverage determination, never give clinical advice. CMS-4201-F and the February 2024 CMS FAQ.
- **Zero monetary cost.** Free tier, open source, or local. Resend's free tier is the only new external service.
- **Audience.** Members, mostly 65+. WCAG 2.2 AA, large targets, plain language are requirements, not polish.
- **No new dependency without a stated reason and what it replaces.** Resend is approved (D-052). Nothing else is.
- **`claude/srs.md` stays frozen.** P1's requirements are the record v1.0.0 was built against and are not retrofitted.
- **The public deployment stays public.** Adding auth must not gate any question a signed-out member could ask before.

---

## 8. Explicit Non-Goals

Deliberately not built in P2, each with its reason:

- **Structured provider search.** D-051. The directory is invented; precise search over invented rows produces a confident wrong answer about a member's own doctor.
- **Pharmacy directory ingest.** D-036 stands unchanged. Proximity search over addresses is not what this product does.
- **Search across conversations.** Drawn in `design/mock/Chatbot Page.dc.html`, never specified. Local history holds a handful of conversations and search over three items implies a scale the product does not have. Cut, and the mock is to be corrected rather than left contradicting the build.
- **Server-side conversation history.** Even with auth, history stays local. Keying transcripts to a member row makes them records, which pulls retention and deletion obligations in for no member-visible gain.
- **Row-level security and audit logging.** P3-01.
- **Delegated or caregiver access.** No proxy login, no shared account. A caregiver holding the device is the member as far as this system can tell, which is why FR-P2-39 exists.
- **Real-PHI production writeup.** P3.
- **An in-app PDF generator.** The browser prints. FR-P2-20.
- **Password or magic-link authentication.** Passwords impose a cognitive-function test this audience fails, which is what WCAG 3.3.8 is about. A pasteable numeric code does not.
- **Semantic caching, Spanish, the eleven-state corpus, appearance customization, rotating tips, coach marks, member document upload.** All P4.
- **Anything in `docs/call-drivers.md` bucket C.** Permanently routed to a person by design, not deferred.

---

## 9. Success Metric

**Measured:** one evaluation run reports P1 and P2 metrics together and every gate is green - faithfulness at or above 0.90 on the extended set, zero login-classifier false negatives, zero drug-tier questions misrouted to prose search, router selection at or above 90%, and no regression in any P1 number. Alongside it, the same question asked under H5141-004 and H8010-002 returns two different correct amounts, and a member signs in inside the panel and receives their own claim status cited to the record field.

**Not measured, and stated plainly:** actual reduction in call volume, unchanged from `claude/srs.md` §9. P2 covers the two remaining call drivers named in the case study, which raises the ceiling on deflection; it does not let us observe it. `docs/call-drivers.md` §5's 5-18% estimate remains a projection.

**Also not measured:** whether a real 65-year-old completes the OTP flow. The keyboard and screen-reader passes in NFR-P2-05 are the closest available proxy and are not the same thing.

---

## 10. Open Questions

- [ ] H8010-002's Summary of Benefits layout is unverified. `pdfToPlanColumn` handles H5141's side-by-side two-column PDF; whether the HMO document has the same shape is unknown until it is fetched, and a different layout is a Stage 1 risk with no fallback decided.
- [ ] Whether H8010-002 carries an Evidence of Coverage and Annual Notice of Change under the same catalog keys as H5141, or whether the document set differs.
- [ ] Resend requires a verified sending domain, or delivery is restricted to the account owner's own address. Which domain is used, and whether verification is possible on the free tier for `v-ai.org`.
- [ ] Whether Part D coverage stage can be derived from seeded claims or must be seeded as a flat field. Deriving it is more honest and more work.
- [ ] Whether the formulary PDF's tier column survives `pdftotext` extraction cleanly enough for typed ingest, or needs the bounding-box path the Summary of Benefits uses.
- [ ] Throttled real-device latency remains unmeasured, carried forward from P1. P2 adds surfaces that inherit the gap.
- [ ] Browser-tooling accessibility verification remains deferred (D-040). Every new P2 surface inherits that gap, and the login flow is the surface where it matters most.
- [ ] Whether contextual follow-up chips (FR-P2-22) can be generated without a second model call, or whether they cost a round trip per answer.

---
