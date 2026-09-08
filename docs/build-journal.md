# Build Journal

> Append-only. One entry per work session, newest at the bottom. Never edit a past entry - if something turned out wrong, say so in the next one.
>
> Each entry: what I set out to do · what actually happened · what surprised me · what I decided as a result.

---

## 2026-09-07, 22:06 EDT - Session 1: everything before the first line of product code

### What I set out to do

Take a list of about twenty features I'd brainstormed for a Clover Health member chatbot and turn it into something buildable. RAG over public plan documents, senior-optimised UI, voice in and out, rotating tips while it thinks, coach marks, document upload, semantic caching, keyboard shortcuts, conversation history, a demo video, a build journal. Group it P1 through P4 and start.

I asked to be pushed back on rather than agreed with, specifically on which items are load-bearing for "reduce calls to customer service" and which are decoration. That turned out to be the right question and it consumed most of the session.

### What actually happened

I did not write a line of product code. I wrote a requirements spec, a call-driver taxonomy, 29 architecture decisions, four staged build plans, a testing strategy, and a failing test harness. Roughly nine hours of specification for zero hours of implementation, which felt wrong at hour three and correct by hour eight.

The order things happened in matters, because each one invalidated part of the last.

**The feature list did not survive contact with a deflection funnel.** The first useful move was writing down the six conditions that all have to hold for a call to actually not happen: the member finds the assistant, trusts it enough to type instead of dial, retrieval finds the right chunk, the answer is complete enough that they don't re-verify by phone, they can read it, and failure doesn't produce a worse call. Anything that doesn't touch one of those is decoration. That test killed about a third of my list in ten minutes.

**Then the whole scoping frame turned out to be wrong.** I was cutting by feature. The goal is stated in calls. So I rebuilt the scope as a call-driver taxonomy instead: 37 things Medicare Advantage members actually phone about, split three ways - answerable from public documents, requires knowing who they are, must never be automated. Bucket A became v1 scope. Bucket B became the roadmap. Bucket C became a guardrail specification with ten named triggers and required behaviour for each, which is a far more useful artifact than "be careful about clinical questions."

**I read the actual assignment PDF four hours later than I should have.** It says members call about "their benefits, their providers, a claim, a prior authorization." Two of those four need identity. I had put the entire authenticated tier in P3-optional. The assignment names half its own problem statement in the tier I had marked as ships-if-time-permits. Split it: the authenticated features moved into P2, the security hardening stayed in P3.

**Then I did the deflection arithmetic honestly and got a smaller number than I wanted.** The common error here is quoting bucket A's share of call volume as though it were the deflection rate. It isn't. Deflection is share × engagement × resolution. Share of fully-resolvable bucket A is maybe 30-45%. Engagement is capped hard by two numbers I can source: roughly 30% of adults 65+ never use the internet, and 46% of adults 50+ report little or no trust in AI. Resolution maybe 60-80% if the citation discipline holds. That multiplies out to **5-18% end-to-end, midpoint around 10%** - well below the 25-45% ceiling the vendor literature quotes.

Two things fell out of that. First, engagement is the highest-elasticity term: doubling it from 25% to 50% doubles deflection outright, and no retrieval improvement does that. So the senior-first UX work stopped being an accessibility obligation and became the top lever, quantified. Second, I have no call-mix data at all - not in my research, not in the assignment. The share number is a reasoned prior, not evidence, and I wrote it down as such rather than dressing it up.

**Specs got frozen and then amended within the same session.** I froze the SRS at 1.0.0, then wrote the testing strategy, and writing the testing strategy found two contradictions in the thing I had just frozen. Amended to 1.1.0. Slightly embarrassing, entirely correct.

**The harness went in red.** 66 tests, all failing against not-implemented stubs, typecheck clean. The fixture corpus is deliberately adversarial - twelve chunks including a cross-plan near-duplicate with a different copay, a conflicting Evidence of Coverage and Summary of Benefits pair, a chunk with no plan year, an injection payload, and a half-answer whose counterpart deliberately does not exist anywhere in the corpus.

### What surprised me

**The two tests that passed.** First run was 64 failing, 2 passing, in a suite where everything should have been red. Both passers were `expect(...).toThrow()`. A bare toThrow is satisfied by *any* throw, including the `not implemented` stub - so they were green before a single line of behaviour existed, and would have stayed green through a completely wrong implementation. Fixed by asserting on the error message. I'd have shipped that without noticing.

**Fish Audio's free tier closed on 31 August.** Seven days ago. I had it written into the plan as the fallback provider on the assumption it was free, which it was when I last looked. This is the concrete argument for verifying every dependency against current docs rather than memory - and the reason the voice chain now terminates in the browser's native speech synthesiser, which is the only tier that cannot expire or run out.

**Gemini's free tier trains on your inputs.** I was going to use it for cost reasons. Sending health-plan queries to a tier that improves the vendor's models is a bad sentence in a health insurer's interview, and the 10 requests-per-minute cap would have throttled a live demo anyway. Azure OpenAI was already available and is BAA-eligible, which also makes it the right pattern for when the data stops being synthetic.

**Choosing the confidence signal changed the build order.** I picked a reranker score floor as the thing that decides answer-versus-refuse, because reranker scores are better calibrated than raw cosine similarity across question types. That single choice pulled reranking out of P2 and into P1, because the refusal gate cannot exist without it. A quality decision turned into a sequencing decision.

**The mock's citation chip is 11px.** The mocks arrived at the end of the session and they're good - the lazy plan-picker appearing mid-conversation on a cost question is exactly right, and the appeals card handles the "how do appeals work" versus "was my denial correct" distinction in one card. But the type audit is 18 uses at 14px, 8 at 12px, 5 at 11px, 4 at 10px, against my own 18px minimum. The citation is the single surface the product's trustworthiness rests on, drawn in the smallest type on the screen, for an audience with declining eyesight. That is the whole product's thesis undermined by a type scale.

### What I decided, and what I cut

**Cut, and stayed cut:**

- **Keyboard shortcut labels** like "Ctrl+Shift+V" printed on buttons. I had reasoned that marking chords helps accessibility. It's backwards: phone users have no keyboard, desktop seniors overwhelmingly don't use chords, and the population that *does* use keyboards is screen-reader users, whose software already claims most Ctrl+Shift combinations. The useful part - Tab reaches everything, Esc closes, visible focus - stayed.
- **In-app font-size controls.** 18px base with guaranteed reflow at 200% zoom makes them redundant. Browser and OS zoom already do this, system-wide, in a way the member has already configured.
- **Phone/IVR, SMS, and an agent-assist console.** This is the cut that hurts. At Clover's real scale the call volume is on the phone, and agent-assist touches 100% of calls rather than a fraction, so it's plausibly higher leverage than anything I'm building. Cut because the product is web-only by decision, and I'd rather name it as the obvious next channel than half-build it.
- **Containment rate as the headline metric.** I chose eval faithfulness instead. It measures answer quality, not deflection, which means the honest answer to "did it reduce calls?" is "we did not measure that." The spec says so in those words rather than claiming the projection as a result.

**Cut, then reinstated with conditions:**

- **Rotating tips and coach marks.** I argued both out on accessibility grounds - motion competing with the answer for the same screen space, overlays breaking focus order, a tour arriving when the member has no context to attach it to. Then put them back at P4 by my own call. The right resolution wasn't winning the argument, it was attaching the conditions: a pause control, never occupying the answer region, 44px dismiss targets, correct focus handling, and re-openable from the help panel so it isn't one-shot.
- **Document upload.** Cut on the grounds that a member uploading a document is uploading an explanation of benefits or a denial letter - protected health information arriving in a system with no controls, through a public deploy, inviting "is this denial correct?" which is squarely the line CMS draws. Reinstated at P4 behind login. The login gate solves the identity half, not the other two, so it ships only with the coverage-determination boundary extended to uploads and a prompt-injection defence with a hostile fixture in the eval. Upload turns a closed corpus into an open one; that's the interesting part and the dangerous part at once.
- **ElevenLabs and Fish Audio.** Cut on cost and dependency grounds in favour of the browser's native synthesiser. Reinstated because voice is genuinely first-class for this audience, which then pulled voice from P2 into P1 and made the free-tier discovery above matter.

**Deferred:**

- **Deterministic tools for provider search and formulary lookup.** Typed queries against structured tables instead of semantic search over prose renderings of tables. Good decision, arrived after the spec was frozen, and it adds a router whose selection rule I haven't specified - which is the part most likely to fail silently, since a misrouted tier question degrades back to exactly the prose search the decision exists to prevent. Deferred to P2 rather than smuggled into a frozen spec.
- **Playwright, axe-core and Zod.** I limited the toolchain to Vitest. The consequence is that every accessibility requirement is currently verified by hand, which is precisely the "asserted rather than tested" position my own testing strategy exists to reject. It blocks Stage 7's acceptance criteria. Written down as the largest known gap rather than quietly skipped.

**The two amendments that came out of writing tests:**

- The spec logged every question verbatim and separately claimed the system holds no protected health information. A member typing "my member ID is 1234567890, was my MRI covered" puts identifiers in the log through the front door with no schema violation. Both statements couldn't be true. Added a redaction requirement.
- Enforcing "no uncited claim" by scanning generated prose for citation markers is weak - it catches formatting failures and not much else. Changed the model to return typed claims each carrying their own citation identifiers, validated at the boundary. A claim with no citation now fails validation before anything can render it, which makes an uncited claim **structurally impossible rather than detectable**. The stronger companion check is containment: every cited identifier must appear in the set actually retrieved that turn. That's what catches a confident answer wearing a valid-looking citation to a chunk that was never in context, which is the sneakiest failure this system has.

### Where I'd start if I lost everything but this entry

Two spikes, in this order, before any product code. Fetch the real Clover documents and see whether they convert to usable text - if the tables don't survive, the product changes shape and I want to know at hour three. Then measure the voice latency loop end to end with real providers, because two of my four latency budgets are guesses until something prints a number.

Everything after that is downstream of what those two produce.
