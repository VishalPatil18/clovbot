# Learnings Log

> Student-facing trail of concepts encountered while building. Each entry teaches _why_ a decision was made, not just _what_ was done.
>
> Written by `/spec-feature` (phase 6). Optional for engineer persona; recommended for student persona.

---

<!-- Template for each learning. Copy below this line for new entries. -->

## Learning - _<short title>_

| Field        | Value                                                  |
| ------------ | ------------------------------------------------------ |
| Date         | _<YYYY-MM-DD>_                                         |
| From feature | _<feature name>_                                       |
| Concept area | _<frontend / backend / db / devops / security / etc.>_ |

### What I encountered

_<The situation that surfaced this concept.>_

### What I learned

_<The concept, explained in plain language. 2–4 sentences.>_

### Why it matters

_<How this concept will apply to future work in this project.>_

### Further reading

- _<optional link>_

---

## Stage 1 and Stage 3 - what the live run taught

**A spike earns its place by failing early.** Stage 1 existed to find out whether the documents convert. It found something better: the Summary of Benefits is one PDF covering two plans in side-by-side columns. Converted naively, "Specialist visit: $10 copay" and "Specialist visit: $2 copay" land on the same line with the column header eighteen lines above. That answer would retrieve real content, cite a real document, pass a faithfulness check, and be wrong for one of two plans, on the most common question members ask. Three hours of spike, not thirty of rework.

**Geometry beats guessing, but only if you measure it.** The obvious column boundary is the midpoint between the two headers. It is wrong, because headers are centred inside their columns, so the midpoint sits in the left column's text. Measured, it cut 5 to 25 words per page. Searching for the x-coordinate that the fewest words cross found the real gutter and dropped crossings to zero on 11 of 12 pages. The lesson is not "use bounding boxes"; it is that the first plausible rule was checkable in one script and was false.

**A guard that fires is worth more than one that passes.** The rule "a page with amounts in two columns must have a plan header" fired on page 15, which turned out to mix a rewards table with full-width disclaimer prose. Splitting that page at a column boundary would have truncated every disclaimer sentence. The guard did not just prevent a bug, it revealed the document's real structure.

**Silently-ignored parameters are worse than errors.** `document-search?zipcode=07302` returns HTTP 200 and every plan in five states. Only `county_id` filters. An API that accepts a parameter and ignores it produces a confident wrong result, so the parser now asserts the response is scoped rather than trusting the request.

**Temperature 0 is not determinism.** The same refusal question, run twice, cited a disclaimer chunk once and nothing the next time. Retrieval was byte-identical both times. This is why the testing strategy asserts on chunk ids and structure and never on generated prose, and why Stage 6's confidence floor exists instead of trusting the model to decline.

**Scope changes have downstream costs that are cheap to name and expensive to discover.** Going from one plan to two made the plan picker real and FR-10 demonstrable. It also turned cross-plan leakage from a synthetic test fixture into the actual corpus, which means retrieval must filter on plan before ranking rather than after. Naming that in D-033 cost a paragraph. Finding it at Stage 6 would have cost a rebuild.

**Security guidance is worth taking even when the shortcut works.** The first Postgres client disabled certificate verification because Supabase serves a self-signed chain. Pinning their CA took one download and kept verification on.

## Stage 4 - what the full corpus taught

**An id that omits part of what makes a thing unique loses data silently.** Chunk ids were built from contract, plan, year, kind and section. Corporate pages share headings, so `Learn More` on the press page and `Learn More` on the leadership page produced the same id, and the upsert let one overwrite the other. Twelve chunks vanished. Nothing errored. It surfaced only because an idempotency check reported one chunk as permanently changed, and chasing that one chunk found the collision. The general lesson: when uniqueness is derived, enumerate every dimension the thing actually varies along, and test the collision case explicitly.

**Non-determinism upstream of a change-detector defeats it.** Generated context prefixes made every ingest see the whole corpus as modified, because the model wrote different words each time. The fix was to freeze the generated text, which the testing strategy had already specified for a different reason. When a pipeline compares "what I have" against "what I would produce", every non-deterministic step in producing it has to be frozen or the comparison is meaningless.

**Read the rate limit before designing around it.** The first fix for HTTP 429 was retry with backoff. It failed five times at sixty seconds. The quota turned out to be 29,000 tokens per minute, not a request count, and twenty-four batches fired back to back exceeded it by an order of magnitude no amount of retrying could absorb. One request inspecting `x-ratelimit-limit-tokens` answered in seconds what retry logic could not.

**A check that cannot fail is worse than no check.** The first fusion measurement asked whether any chunk from the formulary appeared. Every retrieval mode satisfied that trivially, all three scored rank 1, and the acceptance criterion looked met. Changing it to ask whether the chunk containing the drug name appeared revealed dense ranking ORSERDU ninth. The criterion had been passing while measuring nothing.

**State the narrow version of a decision once you can measure it.** D-004 chose hybrid retrieval over pure vector search. Measured: for a common drug the dense half already ranks the answer second, so fusion adds little. It earns its complexity on rare tokens a general embedding model has no signal for, and on paraphrases the lexical half cannot see at all. The decision stands, but "hybrid is better" was replaced by two named examples with ranks attached.

**Delete the code that disagrees with reality.** Three modules and two test files, written before the corpus existed, encoded a data model where contract and plan were one field. Implementing them would have reintroduced the exact cross-plan leak a later decision existed to prevent. Deleting them was faster than reconciling them, and the adversarial test cases worth keeping were kept by fixing their identifiers.

## Stage 5 - what building the measurement taught

**A change to an identifier format can break a parser a stage away.** Stage 4 put the document kind into chunk ids, which introduced underscores. The citation regex allowed letters, digits and hyphens. Every valid citation then parsed as no citation, and because the code treats "no citation" as a refusal, correct answers were recorded as refusals rather than as errors. It survived a whole stage because the wrong behaviour was indistinguishable from a legitimate one. When a format changes, grep for every consumer that parses it, and prefer failures that look like failures.

**Write down what is measured and what is merely observed.** Bucket B and C cases pass today only because the model happens to decline; no guardrail enforces it. Scoring those as passes would have produced a flattering number that Stage 8 could not improve on. Marking them not-yet-enforced, and computing accuracy over enforced cases only, means the harness reports what the build guarantees rather than what it got away with.

**A binary inferred from a side effect will eventually be wrong.** Refusal was inferred from the absence of citations. An answer that declines to give a fact but cites the document explaining where to go is neither a refusal nor a factual answer, so the inference broke on exactly the cases that matter most. The spec already had the right answer - a typed refusal branch - and the shortcut was only ever a stand-in.

**Verify the mitigation, not the intention.** Synthetic provider data was approved with a banner marking it demo data. The eval asked whether a named doctor was in network, and the assistant said the directory is demo data and routed to a human. That is the difference between believing a mitigation works and having a test that shows it.

**Let the first run be red and read it.** The harness was built to fail, and its failures were diagnostic: twelve of seventeen came from one behaviour, per-claim citation, which is a single named requirement rather than a diffuse quality problem. A harness that had been tuned until it went green would have hidden that.

## Stage 6 - what measuring the confidence signal taught

**Test the signal on the population you serve, not the one the benchmark used.** The reranker scores a terse query at 0.998 and the same question in a member's own words at 0.0005. ms-marco is trained on search-box queries; the product's users ramble, hedge, and bury the question mid-sentence. A floor calibrated on clean queries would have refused the audience the product exists for, and the deflection thesis already identifies engagement as its most elastic term. The decision that looked settled in requirements only failed once it met a realistic question.

**Separate what a component is good at from what you asked it to do.** The cross-encoder ranks well, 96 to 100% accuracy@5, and its absolute score is unusable. Those are different properties, and conflating them nearly caused the whole component to be discarded. Keeping it for ordering while replacing the gate was better than either keeping the broken premise or throwing the model away.

**A detector that fires wrongly is worse than no detector.** Comparing dollar amounts to find EOC and Summary of Benefits conflicts fired on unrelated benefits, and being told a conflict existed led the model to state that a real Clover document was incorrect and to invent a figure. A false negative loses a feature; a false positive of this shape manufactures a confident falsehood about a regulated document.

**Structure beats inspection for guarantees.** Stage 5 checked for uncited claims by scanning prose and found twelve. Stage 6 made claims carry their own citation ids and validated at the boundary, and structural compliance went to 100% because an uncited claim can no longer be represented. Detecting a class of defect is weaker than making it unrepresentable.

**Budgets are only real once something prints a number.** Time to first token measured 1632ms against a stated 800ms, unthrottled, and the structured payload makes it worse because JSON precedes the first useful token. The requirement was written months of decisions ago and had never been checked. It is recorded as a breach rather than quietly renegotiated.

## Stage 7 - what building the surface taught

**Read the design folder's README before the design files.** `design/mock/README.md` listed six conflicts between the mock and frozen requirements, ranked, before a line of UI existed. The type scale conflict alone would have failed four acceptance criteria, and the mock's citation chip at 11px would have put the product's entire trust surface in the smallest type on the screen for an audience with declining eyesight. A design handoff that states its own conflicts is worth more than one that looks finished.

**Constants carry decisions, and decisions rot in constants.** D-026 chose a fake phone number so an unaffiliated public deploy could never route real members to a real call centre. Stage 6 then hardcoded Clover's real number into the escalation string that every refusal renders, and it passed review, tests and an eval run. Nothing connected the ADR to the string. The fix was one line; the lesson is that a decision with no test attached is a comment.

**A stated priority and a deferred verification cancel out unless you write it down.** Accessibility was made the priority and its automated verification was deferred to P3 in the same exchange. Both are defensible; together they mean conformance is asserted rather than tested, which is the position the testing strategy exists to reject. Recording the override in an ADR keeps the two answers from quietly resolving into "we said it was important".

**Some of a deferred check is usually available for free.** With axe and Playwright unavailable, a static pass over the CSS and JSX still enforced the type floor, the target minimum, the focus ring, the no-hover rule and the presence of every required surface: 22 assertions, no new dependency. It is not conformance, and it is a regression guard that would catch the exact defect the mock would have introduced.

**Budgets written before code are guesses wearing a number.** 800ms for time to first token was set months of decisions before anything ran, and the measured path is 1632ms of which two thirds is a hosted model round trip. Amending it to the measured value with the reasoning attached is more useful than either failing the criterion silently or trading away per-claim citation to chase it.

## Stage 8 - what enforcing the guardrails taught

**Marking a bucket enforced is what makes its number mean anything.** Bucket B and C had been passing since Stage 5, entirely because the model happened to decline. No code changed when they were flipped to enforced, but the report stopped flattering the build and started making a claim. The habit worth keeping is separating "this behaviour is guaranteed" from "this behaviour was observed", in the artifact itself rather than in someone's memory.

**Rules over-refuse, and that is the right failure to have.** Within one run the guardrails wrongly refused a cost question containing the word "emergency" and an appeal-deadline question containing the word "file". Both are now regression tests. Over-refusal is visible in the refusal rate and diagnosable to a single pattern; under-refusal is a regulatory breach nobody notices. Choosing the noisy failure mode was worth more than choosing the accurate-sounding one.

**A boundary cannot rest on a signal that was never calibrated for it.** Two earlier measurements ruled out the alternatives before a line was written: bucket C questions score near zero on the reranker, and the model's own refusal branch fires inconsistently at temperature zero. Neither was discovered here; both were already in the results files, which is the argument for writing measurements down at the time.

**Run the boundary before the expensive step, not after.** Deciding bucket C before retrieval means a guarded question never reaches the model, so there is no half-formed answer to leak while the refusal is being assembled. It is also free, which is a pleasant coincidence rather than the reason.

**The schema knew before I did.** FR-26's turn record specified `session_id` from the beginning. Stage 3 omitted it, and Stage 8 needed it for the loop breaker. Following the specified shape at the point of writing would have cost nothing; adding it later cost a migration.

## Stage 9 - what voice taught

**A requirement can be impossible rather than merely unmet.** NFR-PERF-04 asked for a complete spoken answer within four seconds. Speech runs at roughly eighteen characters a second, so the answers tested take seventeen to thirty-one seconds to say. No engineering makes speech faster than speech. The requirement had quietly conflated two different things, beginning to speak and finishing, and the only honest fix was to split it. Worth asking of any budget: is this slow, or is this arithmetic?

**Read the provider specification, do not recall it.** Both request shapes came from the live OpenAPI documents. Doing that also revealed that the realtime speech-to-text endpoint the plan assumed does not exist in the REST API at all, which would otherwise have been discovered halfway through building against it. This project had already been bitten once by a provider tier that changed; the habit is cheap and keeps paying.

**Green tests do not mean the program runs.** A TypeScript parameter property compiled fine under Vitest and crashed Node's strip-only loader the moment the server booted. Three hundred and forty-three passing tests covered every function and nothing covered "does the process start". A suite tests what it is pointed at, and it was never pointed at startup.

**The cheap privacy shortcut is usually cheap for a reason.** Live partial transcription was available by streaming audio to the browser's own recogniser, which sends it to Google. It would have cost nothing to build and would have routed a member's spoken health question to a third party in exchange for reassurance while they talk. The editable transcript is the part that actually protects them, and it survives without the shortcut.

**Skipping a spike defers the cost, it does not remove it.** Stage 2 existed to measure the voice budgets at hour six with a throwaway page. Skipping it meant the numbers arrived at Stage 9 with a voice loop already built on top of them. Nothing needed rebuilding, but that was luck: had first audio come in at fifteen seconds rather than four, the loop would have been the wrong shape and the discovery would have come after the work rather than before it.

**A cache key must include everything that changes the artifact.** Keying audio on the text alone would have served yesterday's voice after a provider fell through. Keying on text, voice and provider was right, but the lookup then checked only the primary provider, so every recording made while degraded was invisible. The key and the lookup have to agree, and testing one does not test the other.

## Stage 10 - what preparing a release taught

**A control that looks finished can be wired to nothing.** The "Did this answer your question?" buttons were built in Stage 7, styled, given `aria-pressed`, and tested for their accessible name. They set React state and stopped there. Three stages passed before a Stage 10 acceptance criterion asked whether responses were recorded and the answer turned out to be no. Everything about it was right except the part that mattered, and nothing in the suite asked where the value went.

**Deleting an abstraction deletes what depended on it.** `reproduceTurn` went with `pipeline.ts` at Stage 4, correctly, because that module encoded a data model that no longer existed. But NFR-OPS-02 depended on the capability rather than the module, and nothing connected the two. A requirement with no test is a requirement that can be removed by accident.

**The deployment target is a design input, not a final step.** Two assumptions were invisible until a container was on the table: that a gitignored directory would exist at runtime, and that the filesystem was the developer's. Both were two-line fixes because the coupling happened to be shallow. Had the corpus been read from disk per request rather than from Postgres, Stage 10 would have been a rewrite.

**Ask what a gate is for before adding a tool for it.** The secret scan looked like a dependency decision. It is a question about what must never be in the repository, and the existing test suite already runs on every push. Writing it as a test kept the gate and skipped the tool, and it was worth proving by planting a key and watching it fail rather than trusting that the patterns were right.

**Write down what has not been verified, in the same place as what has.** This stage produces a deployment that nobody has run, latency numbers nobody has taken on a phone, and accessibility criteria deferred two stages ago. Recording those beside the passing tests is the difference between a release and a claim about one.

**A health check that touches nothing checks nothing.** `/api/plans` returned 200 from a service whose environment was mangled, because it reads a constant. Every question 503'd. The endpoint chosen to verify a deploy has to exercise the dependencies the deploy configured, or it certifies that the process is running and nothing more.

**The escape hatch a tool gives you can escape twice.** `gcloud --set-env-vars` accepts `^@@^` to declare its own separator, and the loop repeated that declaration for every variable instead of just the separator. Each name arrived as `^DATABASE_URL`, each value with a trailing `^`, and gcloud accepted all of it without complaint. A string built by concatenation deserves a test that parses it back the way its consumer will.

**Acquire the resource inside the block that reports its failure.** `connect()` sat one line above the `try` whose catch exists to turn an upstream failure into FR-25's error message. So the one error it could raise skipped that handler, became an unhandled rejection, and killed the process for every concurrent member rather than returning a sentence to one. Fixed at the boot instead: a revision with a broken environment now refuses to start, so the deploy rolls it back rather than serving it.
