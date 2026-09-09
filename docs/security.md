# Security posture

What this product defends against, how, and what it does **not** defend against.
A posture document that lists only controls is marketing.

**Dependency audit last run: 2026-09-09.** Section 6 records what was open on
that date and why.

---

## 0. The one that matters most

**Every member record in this system is invented.** The `synthetic` column is a
database constraint, not a comment: a row claiming to be real cannot be inserted.
No real member data enters this system at any version, so the worst outcome of a
total compromise is the disclosure of five fictional people.

The one piece of real personal data anywhere near this project is a set of email
addresses used to demonstrate the sign-in flow. They live in
`OPERATOR_MEMBER_EMAILS` in the environment, are never committed, and the
in-repository fallbacks are unreachable `@example.invalid` addresses.

---

## 1. Input validation and sanitisation

Every request body crosses one module, [`src/validate.ts`](../src/validate.ts).
Handlers do not parse or narrow anything themselves.

**Nothing throws on bad input.** A field that is missing, the wrong type, or an
object where a string was expected becomes a safe default. A body that is not a
JSON object at all is rejected with a 400 before a handler runs. That matters
because a 500 on malformed input is both a worse experience and an information
leak.

**Every entry point has a ceiling**, and an oversized request is destroyed while
being read rather than buffered:

| Surface | Ceiling |
| --- | --- |
| Any JSON body | 200 KB |
| Uploaded audio | 8 MB |
| Question | 500 characters |
| Callback note | 1,000 characters |
| Text sent for synthesis | 5,000 characters |
| Email address | 254 characters |
| Sign-in code | 32 characters |

**Enumerated fields accept only what is offered.** A language is `es` or `en`,
never a third value. A feedback reason is matched against the four the interface
offers and dropped otherwise, so the endpoint cannot be turned into a free-text
channel into the database. A plan id is resolved against what is actually
indexed, and an unknown one is a 400 rather than a silent empty retrieval.

**Injection.** Every database call is parameterised through `pg`; no SQL is
assembled by concatenation anywhere in this repository. On the frontend there is
no `dangerouslySetInnerHTML` and no `innerHTML` assignment: React escapes every
value, and answer text is rendered as typed claims rather than markup.

**Identifier redaction** runs before a question is persisted **and** before it is
sent to a model, not only at the log write, because a fallback provider may train
on what it receives. Patterns are ordered most-specific-first and remove
identifier shapes rather than any long number, so `30 day supply`, `$40` and
`2026` survive and the log stays useful.

---

## 2. AI-specific: prompt injection and answer integrity

The corpus is public plan documents fetched from `cloverhealth.com`. A document
could contain text shaped like an instruction, and a member can type anything.

**The prompt rule is the weakest layer, and it is not what this relies on.**
Retrieved text is fenced inside `<sources>` and the system prompt says it is data
and never instructions. That helps, and it is not a control, because it asks the
model to police itself.

**The control is structural.** The model does not return prose. It returns typed
claims, each carrying the ids of the chunks it is citing, and the application:

1. **Validates the payload shape.** A claim with no citation cannot be
   represented in the type, so an uncited claim cannot be rendered.
2. **Enforces citation containment.** Every id the answer cites must have been
   retrieved on that turn. An id that was not is a rejection, which catches a
   confident answer wearing a valid-looking citation to a chunk that was never in
   context.
3. **Renders the prose itself.** The application builds the sentences from the
   typed claims. There is no path by which model output becomes markup.
4. **Refuses rather than degrading.** A payload that fails validation produces a
   refusal and the human path, never a best-effort answer.

So the ceiling on a successful prompt injection is: cause a refusal, or cause a
claim that is *cited to a document that was actually retrieved*. It cannot
produce an uncited assertion, cannot cite something that was not in context, and
cannot emit HTML or a link.

**Two further limits on what the model can do.** Guardrails for clinical,
enrolment and adjudication questions are **deterministic rules, not a
classifier**, and run **before retrieval**, so a guarded question never reaches
the model at all. The same is true of the sign-in gate: whether a question needs
a member's record is decided by rule before any model call, and the member id
comes from a live session row and nowhere else, so no classifier — however wrong
— can cause one member's data to be retrieved for another.

**Temperature is 0** and the answer is not a chat: there is no tool use, no agent
loop, and no path by which a model response causes an action other than rendering
text the application has already validated.

---

## 3. Authentication and access

| Control | How |
| --- | --- |
| Sign-in | Emailed one-time code. No password exists to leak or reuse. |
| Code storage | **Never plaintext.** scrypt with a per-row salt, deliberately slow, because six digits is a million possibilities and a fast hash falls to an offline sweep if the table leaks. |
| Code lifetime | 10 minutes, five attempts, then dead. |
| Enumeration | The request endpoint returns the same response whether or not an address is enrolled. |
| Session cookies | `HttpOnly`, `SameSite=Lax`, and `Secure` whenever the request arrived over HTTPS, derived from the forwarded protocol so production sets it and a local plaintext port does not. |
| Session lifetime | 30 minutes idle, 8 hours absolute. Expiry is told apart from never having signed in, so a member is told what happened. |
| Member scoping | Enforced **by the database**, not only by the query. |

**Row-level security is the real boundary.** The service connects as a role that
is `NOBYPASSRLS` and holds no DDL privilege. Every member-scoped table has
`FORCE ROW LEVEL SECURITY`, so even the owning role is filtered. The identity is
set transaction-locally from the session row and from nowhere else; an
unidentified connection reads **zero** rows rather than every row.

This is proven by [`npm run check:rls`](../scripts/rls-check.ts), which connects
directly as the application role, sets one member's identity and issues raw
selects for another member's rows. It runs in CI. Every earlier version of that
check called application code and so only tested the `where` clause inside it.

**Minimum necessary.** Being signed in is not a reason to read a record: the
question has to need it. A cost question touches no claim, no prior
authorisation and no appointment, and nothing anywhere reads the member's name.

**Rate limits**, counted in Postgres so they survive a restart and are shared
between instances:

| Surface | Limit |
| --- | --- |
| Questions | 20 per session per hour, 60 per IP per hour |
| Sign-in codes | 10 per address per hour, 30 per IP per hour |

---

## 4. Logging and monitoring

**What is recorded.** Every turn: the redacted question, the retrieval path and
why it was chosen, the chunk ids returned, the outcome, the refusal trigger, the
provider and per-stage latency. Every authenticated read: which member, which
fields, from which rows, when, and what came of it.

**What is deliberately not recorded.** No one-time code, ever, in any form. No
indication of whether an address matched a member. No value from any protected
column: the access log names columns and row ids, never contents, because a claim
amount in the audit trail would make it a second copy of the thing it audits.
No member name, phone or email on a callback record.

**The audit log is append-only by grant, not by convention.** The application
role holds `insert` and `select` on it and nothing else, so a code path that
tried to rewrite history is refused by the database. Proven by
[`npm run check:audit`](../scripts/audit-check.ts), which runs real turns and
then attempts an update and a delete.

**A failed audit write fails the turn.** At that point no answer has reached the
member, so nothing is disclosed without a record of it.

**Reading it is command line only:**

```bash
npm run insights                  # containment, refusal reasons, feedback, unanswered questions
npm run reproduce -- <turn-id>    # rebuild the exact context behind a past answer
```

Both read the turn log, which holds member questions. Publishing that as a route
would undo what the redaction is for.

### What monitoring does not exist

Stated plainly because this is the weakest area of the posture:

- **No alerting.** Nothing pages anyone. A refusal spike, an authentication
  failure spike or a router drift is visible only if someone runs `insights`.
- **No dashboard.** The data is there; nothing watches it.
- **No error tracking service.** Failures reach Cloud Run's logs and stop there.
- **No anomaly detection on the access log.** It records unusual access; nothing
  notices it.
- **No log retention or rotation policy.** Nothing is deleted, anywhere.

The gap between "recorded" and "monitored" is the honest description of where
this sits. [`docs/future-work.md`](./future-work.md) covers what closing it costs.

---

## 5. Transport and browser hardening

Served by Vercel with:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`, same-origin script, style, image, font and connection sources; `media-src 'self' blob:` for synthesised audio; `object-src 'none'`; `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `microphone=(self), geolocation=(), camera=()` |

The policy is strict because **nothing in this product loads from a third-party
origin**: no CDN, no webfont, no analytics, no tag manager. `style-src` allows
`'unsafe-inline'` for the animation library's inline style attributes; `script-src`
does not, and there is no `unsafe-eval`.

The API is proxied through the same origin (`/api/*`), which keeps the session
cookie first-party and means `connect-src 'self'` is sufficient. There is no CORS
allowance for any other origin.

**CSRF.** State-changing endpoints are protected by `SameSite=Lax` cookies and a
same-origin fetch path. There is **no CSRF token**. `SameSite=Lax` blocks the
cross-site POST cases that matter here; a token would be the stronger control and
is not implemented.

Verified by loading the built page in a real browser under the policy and
checking for violations, rather than by reading the header back.

---

## 6. Dependency posture

Dependencies are pinned to exact versions, never ranges, and every one was
checked against current documentation when added rather than from memory.

`npm audit` runs on **every push**. A **critical** advisory fails the build. A
**high** is printed as a warning and recorded here. That asymmetry is deliberate:
the four open advisories below have **no fix available**, so a blocking gate
would leave the pipeline permanently red and teach everyone to ignore it.

### Open advisories, as of 2026-09-09

Four high-severity advisories, all reached through
`@huggingface/transformers@4.2.0`, which is the local reranker and **is the
latest published version**. `npm audit` reports `fixAvailable: false` for all
four.

| Advisory | Path | Why it is not reachable here |
| --- | --- | --- |
| `sharp` / libvips, CVE-2026-33327 and CVE-2026-33328 | `@huggingface/transformers` → `sharp` | `sharp` decodes images. This application never decodes an image: the reranker scores text pairs, and no user-supplied bytes reach an image decoder. |
| `adm-zip`, 4 GB allocation from a crafted ZIP | `@huggingface/transformers` → `onnxruntime-node` → `adm-zip` | Reached only when extracting an archive. The ONNX model is a pinned artefact fetched at build time, not user input, and no request path unpacks an archive. |

**The residual risk is the supply chain itself**, not these code paths: if the
pinned model artefact or a package were replaced upstream, the reachability
argument above would no longer hold. That risk is accepted for a case study with
no real data and is the reason the audit runs on every push rather than never.

**Re-check when** `@huggingface/transformers` publishes past 4.2.0, or on the next
release, whichever is first.

### Secrets

No credential, key, endpoint or password is in this repository. That is asserted
by a test that scans what git actually tracks, not by convention, so a key pasted
into a source file or an accidentally committed `.env` fails the build.

The application role's password is chosen by the operator and never enters the
repository. Deployment passes every credential as an environment variable; no
secret is baked into a container image.

---

## 7. What is not protected

The honest list.

- **No CSRF token.** `SameSite=Lax` and a same-origin path are the protection.
- **No identity proofing.** Anyone who controls a seeded inbox can sign in as
  that member. There is no second factor and no knowledge-based verification.
- **Anyone who guesses a seeded address can make the site send mail to it**,
  capped at ten an hour. A code is useless without the inbox, so the worst case
  is nuisance mail.
- **No delegated or caregiver access**, and therefore no controls around it.
- **No alerting, dashboard or anomaly detection.** See §4.
- **No retention or deletion policy.** Nothing is deleted. The one exception is
  that signing out clears record-sourced answers from the browser's saved
  conversation, on the reasoning that a shared tablet is indistinguishable from
  the member's own.
- **No encryption at rest beyond what Supabase provides**, and no key management
  of our own.
- **No formal penetration test, threat model document, or third-party review.**
  This posture is the result of an internal review, and says so.
- **The four dependency advisories in §6 are open**, with a reachability argument
  rather than a fix.
- **A downloaded transcript is outside anything this system can enforce.** It is
  built on the device and never sent anywhere, and once saved it is a file on
  hardware we do not control.

What a real deployment over real member data would owe on top of all of this is
in [`docs/real-phi.md`](./real-phi.md), control by control.

---

## 8. Reporting

See [`SECURITY.md`](../SECURITY.md).
