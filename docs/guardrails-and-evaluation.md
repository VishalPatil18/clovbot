# Guardrails and evaluation

> What the assistant refuses to do, and how we know the rest of it works.

---

## Why rules rather than a classifier

Every gate in this system that has a zero-tolerance failure is a **deterministic rule**. Guardrails, the router, and the login-required check are regular expressions with explicit carve-outs, not model calls.

Three reasons, in order of weight:

1. **The same question must refuse on every run.** A guardrail that fires 99% of the time is not a guardrail, it is a tendency.
2. **Every refusal must be explainable by pointing at the rule that fired.** When a member asks why they were refused, "the model decided" is not an answer a plan can give.
3. **It fails in the safe direction.** A rule that is too broad refuses something answerable, which is visible and fixable. A classifier that is subtly wrong answers something it should not, which is invisible until it matters.

The cost is real: rules are slower to write, need an `unless` clause for every phrasing that looks like the trigger but is not, and have to be maintained in two languages. That cost is paid deliberately.

---

## The refusal categories

Ten triggers, from [call-drivers.md](./call-drivers.md) section 6. Order matters: **emergencies are checked first**, because a member describing acute symptoms needs care guidance before any other boundary applies.

| Trigger | Refuses | The `unless` that keeps it usable |
| --- | --- | --- |
| C-06 | An emergency described in the question | "emergency room copay" is a benefit question, so the bare word cannot fire it. Either an acute symptom, or the member saying they are in one now. |
| C-02 | Clinical advice, symptoms, medication decisions | - |
| C-03 | Whether to delay or skip care | - |
| C-01 | Coverage determinations, and whether a denial was correct | "How do I file an appeal" is a process the documents describe, and is answered. |
| C-05 | Filing an appeal or grievance on the member's behalf | The process is answered; the filing is not. |
| C-04 | Choosing, comparing, joining or leaving a plan | - |
| C-07 | Fraud, waste and abuse reports | - |
| C-08 | Complaints about care or a provider | - |
| C-09 | Changing a record, or acting for someone else | - |
| C-10 | Anything below the retrieval confidence floor | Enforced in the answer path rather than by phrasing. |

An emergency does not refuse in the ordinary sense. It **breaks out**: call 911, emergency care is covered anywhere in the United States and worldwide with no prior approval, and Member Services can help once you are safe.

### The regulatory line

Binding guidance is CMS-4201-F plus the CMS FAQ of 6 February 2024: AI may assist but must not make coverage denials, determinations must be individualised, and AI should not function to delay or discourage care. The product line is **inform, never adjudicate**, and C-01 is where that is enforced.

Reading a member's own stored claim back to them is disclosure of a record, not adjudication of a claim. That distinction is what makes the authenticated tier a records feature rather than a decisions feature.

### Two languages, and a lesson

The rules fire in English and Spanish. That was not free, and the golden set is what proved it: translating the ten explanations left the **patterns** English-only, so a Spanish emergency matched nothing at all and the translated copy was never reached. A guardrail that speaks the right language but never triggers refuses nothing.

Any language other than these two gets a plain handover rather than a half-translated guess, because there is no source document to cite in it.

---

## Other boundaries

**Identifier redaction.** A member id, date of birth or social security number typed into a question is redacted *before the model call*, not only before the log write. The question stays readable; the identifier is gone.

**Rate limits.** Twenty questions an hour per session and sixty per network, counted in Postgres so the count survives a restart. Sign-in codes are capped at ten an hour per address and thirty per network.

**The loop breaker.** After two consecutive refusals the assistant stops inviting another try and offers a callback, pre-filled with the question, the plan and the documents already searched.

**No membership oracle.** Asking for a code at an address that is not enrolled returns the identical reply to one that is, and sends nothing. The endpoint cannot be used to discover who is a member.

---

## Evaluation

One command, four reports, all of them gating:

```bash
npm run eval
```

### The golden set

66 hand-labelled cases across five buckets:

| Bucket | What it holds |
| --- | --- |
| A | Answerable from the plan documents, with the expected source and key fact pinned by hand |
| B | Member-specific. Five expect a sign-in offer; three expect a refusal, because no such field is stored and a login would walk the member to the same refusal |
| C | Guarded. Every one of the ten triggers |
| adversarial | Prompt injection and out-of-scope probes |
| ES | Spanish, four of them paired with an English case on the same plan |

The paired Spanish cases are the interesting ones. ES-03 asks the HMO's out-of-pocket maximum in Spanish and expects `$6,000` where the PPO expects `$9,250`: plan scoping has to survive a language change, and a disagreement between the English and Spanish answers is a **corpus defect to report**, never something to reconcile in the prompt.

### What is measured

| Report | Measures | Gate |
| --- | --- | --- |
| Answers | Faithfulness judged against retrieved chunks, structural compliance, refusal rate, per bucket, per language | Faithfulness 0.96, structural 1.0, refusal at or below 0.20 |
| Router | Which retrieval path each question took, as a confusion matrix | 90% overall, and **zero tolerance** for a drug question degraded to prose |
| Login detection | Both directions, separately | **Zero tolerance** on false negatives; 95% on false positives |
| Regression | Every P1 metric against its measured floor | All floors |

Two of those deserve their reasoning stated.

**Login false negatives are gated at zero and false positives at 95%, reported separately and never pooled.** Answering a member-specific question without a session and gating a public question are both classifier errors, and nothing else about them is alike. A single accuracy figure would let the severe one hide behind the harmless one.

**Faithfulness is reported per language.** Six Spanish cases against sixty English ones could score zero and move a pooled mean by a tenth.

### The floor is a measurement, not a preference

Faithfulness moves on its own at temperature 0. Across six runs with no code change, one case scored 0 three times and another once. One case of thirty-six is 0.028, so a gate at 1.000 would fail the build on a single flip.

The floor sits **one case below the measured baseline**, with that measurement recorded beside the number. One flip passes; two do not.

The flipping was investigated rather than assumed to be noise, and it is not noise: both cases add a clause their cited chunk does not state - *"before the drug will be covered"*, *"waived if you are admitted"*. The judge is right each time. This is recorded as an answer-quality signal about unsupported glosses, and the correct response when the gate next fails is to look at what the model added, not to raise the floor.

### Judge calibration

The faithfulness judge is itself verified before it is trusted: `eval/harness/calibrate.ts` feeds it known-good and known-bad pairs and fails if it cannot tell them apart. A judge that passes everything measures nothing.

---

## Security proofs

Two checks run against a real database with the application bypassed, because a control tested through the application tests the application.

```bash
npm run check:rls     # 38 assertions
npm run check:audit   # 14 assertions
```

`check:rls` connects as the application role, sets one member's identity, and issues raw selects for another member's rows. It also asserts that the role cannot bypass row-level security, that a connection with no identity reads nothing, that the identity does not outlive its transaction, and that every table in the catalog holding a `member_id` either has a policy or is a recorded exemption.

It deliberately does **not** disable a policy to watch a leak appear. That needs an exclusive lock the reading connection then waits on, and it puts a "turn off security on the live table" path into a script that runs in CI. Instead it proves the check is not vacuous: the identical query run as the member who owns those rows returns them. Same query, same table, different identity, different result. The difference is the policy.

`check:audit` runs real turns and asserts one audit row per authenticated turn with the topic that caused it, zero fields read for a plan-document question, no amount anywhere in the row, `update` and `delete` refused by grant, and the cited field present in the log.

---

## What is not measured

- **Deflection rate.** There is no traffic. Faithfulness is the success metric instead, and the ROI arithmetic in [ideas.md](./ideas.md) is labelled as an estimate.
- **Real-device latency under a throttled network.** The numbers are unthrottled desktop.
- **Screen-reader behaviour on the login flow.** Static accessibility assertions exist; a real pass needs browser tooling.
