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

## P2 Stage 1 - what indexing a second contract taught

**A feature that demonstrates correctly can be built on a constant.** Plans 004 and 007 returned different copays from the moment Stage 1 of P1 shipped, so plan scoping looked proven. Both plans sat on one contract, which the code carried as a single environment variable. The demo exercised the half that varied and never touched the half that did not, and a demonstration that only moves the variables you happened to build is not evidence about the ones you did not.

**Fetch the artifact before writing the plan.** One PDF pulled into a scratch directory answered two open questions and found a converter bug, before any stage code existed. The alternative on the table was to spec against the assumption and treat the layout as a risk, which would have surfaced the same bug mid-implementation with a plan already written around it. The cost of looking was two minutes.

**Inheriting a measurement is not the same as inheriting a fact.** The column extractor passed a whole struct to pages that lacked a header row: which plan sits left, which sits right, and the exact x coordinate of the gutter between them. The first two are properties of the document. The third is a property of one page's words, and pages differ - these alternate recto and verso. The fix was not a better inheritance rule; it was noticing that two of the three fields were inheritable and one was not.

**Check whether the numbers you are pairing actually differ.** Four of the five cross-plan test pairs were chosen from the converted corpus. Two obvious candidates, the specialist and primary-care copays, turn out identical between the HMO and the PPO. Written from the requirement rather than from the documents, those pairs would have passed forever while proving nothing, which is worse than failing.

**A test that has never failed has not been tested.** The cross-plan leakage check reported zero leaks on its first run, which is exactly what a check with an inverted predicate, an empty loop, or a typo in its scope would also report. Inverting the predicate by hand and watching it report 300 took one command and is the difference between a passing check and a check.

**A typecheck covers what its include list says, and nothing warns you.** The browser code had never been typechecked: the root config listed four directories and `web` was not among them, and Vite strips types without checking them. Every type error written into the interface since it was built has been invisible, and the tooling reported success the whole time. Coverage gaps in a linter are silent by construction.

**A guard is better than a default when the default will be wrong later.** Contract-wide documents needed some contract while the corpus had one, and the honest options were "pick the first" or "refuse to answer". Refusing meant the code failed loudly at the exact moment a second contract arrived, which is when the decision actually had to be made. A default would have picked H5141 and been silently wrong for a stage and a half.

## P2 Stage 2 - what building a second retrieval path taught

**A regex can be doing load-bearing work by accident.** The formulary heading pattern excluded lowercase, which was a bug: two real drug classes were never detected. But the same exclusion was also what kept drug rows from being read as headings, because a row contains "15mg". Fixing the bug broke the accident, and the tests caught it in the same minute. The lesson is not that the fix was wrong; it is that a pattern which happens to separate two things is not the same as a rule that says which is which.

**A silent classifier is worse than a loud one.** A missed heading produced no error, no warning and no empty section. The drugs beneath it simply joined the class above, and the citation shown to a member named the wrong one. It had been in every committed eval result since the golden set was written, in plain text, and nobody read it because nothing asked us to. Structure that is inferred needs an assertion that it was inferred correctly.

**Count what you dropped, not just what you kept.** The layout-text parser recovered all 2,468 rows, which looks like complete extraction. It also discarded 943 continuation lines, and one of the things on them was step therapy. Measuring the wrong denominator makes a lossy parse look total.

**Uniqueness is a cheap correctness probe on a parser.** The page-number rule silently swallowed "10 mg" and merged three strengths of one drug into a single row. Nothing failed - the parse returned rows, the tiers were right, the categories were right. Asserting that no two rows share a printed name found it immediately, because a parser that drops a distinguishing field produces duplicates.

**When a test disagrees with the system, find out which is wrong before changing either.** Two routing cases failed because they expected Ozempic and Mounjaro to be uncovered. That was a guess about the corpus written into a test, and the corpus disagreed: both are on the formulary at Tier 3. Editing the router to match would have encoded the guess. The rule is to check the source, then fix whichever is actually wrong.

**Reuse the contract, not just the code.** A drug row could have had its own answer format, its own citation renderer and its own validation. Projecting it into the shape a retrieved chunk already has meant cite-or-refuse, the structured payload and the citation numbering all applied to it without a line of new logic - and it made "structured answers carry citations in the same format" true by construction rather than by a second implementation that has to be kept in step.

**A deterministic gate is only as good as its index.** Routing on drug names that are actually indexed makes tier-to-prose misrouting impossible for any drug we hold, which is a stronger guarantee than any accuracy figure. It also means the failure mode moved: a drug missing from the table, or a name spelled differently than the row, now falls through quietly. The confusion matrix measures a lookup, so a miss is a gap in the data rather than a model needing a better prompt.

## P2 Stage 3 - what a prompt change cost

**A system prompt is a budget, not a list.** Adding an eighth rule to seven diluted rule 4, the refusal rule. A pharmacy question the corpus deliberately cannot answer started being answered from adjacent prose, and faithfulness fell from 1.000 to 0.989. Nothing about the new rule mentioned refusing; it simply took up room. Any addition to a standing prompt has to be measured against the golden set, because the cost lands somewhere other than where the change was made.

**Saying "this instruction changes nothing" does not make it so.** The rule was rewritten to state explicitly that it was display-only and altered nothing about what was answered or refused. The regression survived the rewrite. Only deleting the rule restored the behaviour. A model does not read a disclaimer as an exemption.

**Even naming an unused field costs something.** With the instruction gone but the field still listed in the declared JSON shape, one case's faithfulness sat at 0.667 instead of 1.0 with retrieval byte-identical. The field was removed from the shape entirely, which returned the file to exactly what it had been. The cheapest way to be sure a prompt has no effect is for it to be unchanged.

**Put the clock in the signature.** The staleness rule takes `now` as a parameter, so the plan-year boundary is five assertions rather than a date to wait for. It also surfaced that `getFullYear` is local time, which would have moved the boundary with wherever the container happened to run.

**Two dates that sound like one.** "Corpus ingestion date" reads as a single fact and is two: when the documents were fetched, and when they were indexed. A member asking whether an answer is current means the first; the pipeline only knew the second. Incremental ingest makes the second actively misleading, since re-embedding a third of the index moves it to today while most of the corpus is older.

**A feature can be finished and still not shippable.** The contract, the validation, the layout, the contrast and the degradation rule were all built and all pass. The one thing that fills them cost more than they were worth. Shipping the parts that hold and recording precisely why the last one does not is a better outcome than a card that is right about a number and wrong about a refusal.

## Grouped long answers - what the readability pass taught

**Measure the problem before designing for it.** "Long answers are a wall" was true of 3 answers in 36. Knowing that changed the shape of the fix: a presentational grouping rule rather than a markdown pipeline, a prompt change and a new dependency for 8% of cases.

**The request and the need are not always the same thing.** The ask was markdown styling. The need was that nine sentences at one visual weight are unreadable. Markdown was one way to meet it and the most expensive - it would have contradicted the answer contract, cost measured faithfulness, and rendered model output as markup. Grouping met the same need using a fact the payload already carried.

**Structure can carry provenance instead of decorating text.** Grouping claims by the source they cite gives a long answer headings that are true by construction: every sentence beneath a heading really did come from that section. A markdown heading the model wrote would look identical and mean nothing.

**Falling back is part of the rule.** Grouping only helps when neighbours share sources. When every claim cites something different, one group per claim is the original wall with headings added, so the rule detects that and renders flat. A layout rule without its own off switch makes some inputs worse.

**Not fixing something is a decision worth recording.** Two near-duplicate claims in A-24 became more visible under grouping. Hiding one would have been three lines of similarity check and would have made the application the editor of which cited claims a member sees. Leaving it visible is the smaller change and the more honest one.

## P2 Stage 5 - what seeding a member tier taught

**A projection built once pays for itself twice.** Stage 2 turned a drug row into a citable source so it could travel the existing prompt, citation and cite-or-refuse path. Stage 5 needed exactly that for a record field, and the whole member tier landed without touching the answering prompt - which, after D-069, is the most expensive thing in this codebase to touch.

**Per-plan facts must be stored per plan.** The Part D deductible is $150 on one plan and $220 on another. A single constant would have placed a member in the wrong payment stage for a $70 band and produced a confidently wrong answer about their own drug costs, with nothing to catch it.

**Refusing to invent is a deliverable.** The corpus does not state one plan's Part D deductible, so no seeded member is on that plan. The alternative - a plausible number - would have looked identical, demoed identically, and been wrong in a way no test could find.

**Let the type system tell you where an abstraction ends.** Adding a member-record kind to the corpus document union broke the byte-floor table. That was the right failure: a record has no byte floor, no snapshot, no plan year of its own. Widening only the citation layer took one type and no casts.

**A test can be wrong in a way only variance reveals.** One golden case matched a single phrasing of a question that has three correct answers. It passed for two stages, then failed twice on answers that were faithful and cited. The fix was not more accepted strings but asserting the property the case actually existed to prove - that the HMO quotes no out-of-network price.

**Measure your harness's noise before you trust a single run.** Two cases moved between runs at temperature 0 with no code change. Without that number, the first failing run reads as a regression and sends you hunting a bug you did not write.

## P2 Stage 6 - what building a login taught

**A helpful error message can be an oracle.** Telling someone "that address is not registered" is the friendlier reply and it lets anyone enumerate who is enrolled. The same answer either way costs nothing, and the copy - "if that address is on file" - keeps it from being a lie.

**Check the fatal conditions before the interesting one.** Expiry, single use and lockout are all decided before the submitted code is compared. Reversed, a dead code could still be probed for correctness after its window closed, one attempt at a time.

**Reusing a session id across a privilege change is the bug, not the shortcut.** The anonymous cookie already existed and attaching a member to it was one line. It would also have meant anyone who knew the pre-login id inherited the signed-in session. Rotating costs a `randomUUID`.

**Build the structural half of a guarantee before the clever half.** Stage 7 adds a classifier that decides which questions need a login. Stage 6 made the member id reachable only from a session row, so the classifier can be wrong without disclosing anything. The safety property no longer depends on the accuracy of anything.

**A schema constraint can catch a requirements answer.** "Point all five members at my address" collided with a unique index, and behind the index sat the real problem: a code arriving at one inbox cannot say which of five members is signing in. The database refused something the requirements had not thought through.

**Personal data belongs in the environment even when the person offering it is the one asking.** Five real addresses would have been committed to a public case-study repository. They live in `.env`, the seed keeps unreachable fallbacks, and a fresh checkout works with nobody able to sign in - which is the right default.

**Twice is a pattern, not noise.** A-21's faithfulness has now dropped to zero in two of four runs, on the same added clause. Once was variance worth recording; twice is a known answer-quality issue, and re-running until it passes would be selecting the result.

## P2 Stage 7 - what login detection taught

**Build the enforcement before the detection, and the detection stops being dangerous.** Stage 6 made member data reachable only through a session row. By the time the classifier arrived, being wrong could cost a worse answer but never a disclosure. A guess is safe exactly when something else is guaranteeing the property.

**A possessive is not a signal; adjacency is.** "My copay for a specialist visit" and "my last visit" both contain "my" and "visit". Matching anywhere in the sentence gated a price question as an appointment. The rule has to say which noun the possessive is attached to.

**The distinguishing clause is often the second half.** "What is my out-of-pocket maximum" is public. "How much of my out-of-pocket maximum have I used" is not. The subject is identical and the decision lives entirely in "have I used".

**Never average two errors that cost different things.** Answering a member's question without knowing who they are, and putting a public question behind a login wall, are both classifier errors and nothing else about them is alike. One is gated at zero and the other at 95%, reported separately, because a single accuracy figure would let the severe one hide behind the harmless one.

**Read your own learnings file before repeating what is in it.** A const declared below its top-level call site threw after all sixty eval cases had run. The identical fault, in the identical file, is written up two stages earlier. The notes only pay off if they are consulted before the code, not after the failure.

## P2 Stage 8 - what closing the tier taught

**Test expectations rot when behaviour is added, not just when it changes.** All eight bucket B cases expected a refusal, which was correct until a login existed. Nothing failed - the cases still passed - and they had quietly stopped describing what the product should do. New capability is a reason to reread old expectations.

**A floor is not a regression gate.** CI failed below 0.90 while the real number was 1.000, so a slide to 0.91 would have passed silently. The gate has to know the baseline, not just the disaster line.

**Set a tolerance from a measurement, and write the measurement next to it.** The faithfulness floor is one case below the baseline because one case is 0.028 and a single flip should not fail a build. That is defensible. A round number chosen because it felt safe would not be, and would drift upward every time it failed.

**Look at what keeps failing before deciding it is noise.** Two cases dipping across six runs looked like judge variance. Both turned out to add a clause the cited chunk does not state. The judge was right each time, and calling it flakiness would have thrown away a real signal about the model glossing beyond its source.

**Do not gate a question the system cannot answer either way.** A refill date is member-specific by any definition, and we store none. Gating it walks a member through a login to reach the same refusal. The rule became "fields we actually hold", and that narrowing is written down rather than left as an unexplained gap against the requirement.

## P2 manual test pass - what a browser found that 669 tests did not

**A TypeScript union and a SQL check constraint drift apart in silence.** `TurnRecord.outcome` gained `needs_login` in Stage 7, the type checker was satisfied, every test passed, and the database rejected the row on the first real question. Nothing in the type system reaches into a constraint written in a migration. The regression test now reads the union out of the source and asserts the migration covers each member, so the two are checked against each other rather than trusted to stay aligned.

**Cover the layer nothing else exercises.** The eval harness and the unit tests call `answerTurn` directly. Only the HTTP server writes a turn row, so the write path had no coverage at all, and it was the first thing a member touched. The gap was not in the hard part; it was in the plumbing around it.

**A failure after the answer is a different failure.** The answer had already streamed when the insert threw, and the catch sent an error event over the top of it. The member watched a correct, cited answer turn into "something went wrong". Once output is delivered, an error in what follows is an operator's problem, not the reader's.

**Manual testing finds placement bugs that a static test cannot see.** Every assertion about the sign-in form passed while it was rendering above the fold of a scrolled conversation. "Is it in the document" and "can the member see it" are different questions, and only one of them was being asked.

## Cutting v1.1.0 - what the deploy taught

**A config file read by two parsers has to satisfy the stricter one.** `.env` is read by Node's `--env-file` when the app runs and by bash `source` when the deploy runs. Node accepts an unquoted `Clovbot <bot@domain>`; bash reads it as two redirections and dies. Every test exercised the tolerant reader, so the file was wrong for weeks and only the deploy noticed.

**A template that ships broken breaks every copy of it.** The fault was in `.env.example`, so it was not one machine misconfigured. Anyone following the setup instructions would reproduce it exactly. `bash -n` on the template is a one-line test for the whole class.

## P3 Stage 1 - what enforcing it in the database taught

**Check who you are connected as before writing a policy.** Row-level security is silently inert for a role with `BYPASSRLS`, and `FORCE ROW LEVEL SECURITY` does not override it. The entire stage could have been written, reviewed and merged, and the first test would have passed for the wrong reason.

**A connection pooler turns a session setting into a cross-request leak.** Session mode hands the same server connection to the next client. An identity set with `SET` rides along; one set with `set_config(..., true)` dies with its transaction.

**The obvious way to prove a security check works can be the wrong way.** Disabling a policy to watch the leak appear needs an exclusive lock that the reading connection then waits on, and it puts a "turn off security on the live table" path into a script. Proving the check is not vacuous is what actually matters, and running the identical query as the member who owns the rows does that with no DDL at all.

**Some tables cannot be protected by the thing they establish.** The sign-in tables are read to discover who the member is, so a policy keyed on that identity would lock out the only path that can create it. The answer is a different control, named and recorded, not a permissive policy that makes the schema check pass while protecting nothing.

## P3 Stage 2 - what the audit log taught

**A security control can break the path that creates the thing it protects.** Putting `members` behind a policy locked out sign-in, because both sign-in paths read that table before any identity exists to satisfy the policy. Nothing failed loudly: a join simply returned zero rows, and every caller read that as "nobody is signed in".

**Test the path that establishes identity, not only the paths that use it.** The row-level security check was thorough about member-scoped reads and said nothing about login, which is how a broken sign-in passed a green security check.

**Derive the audit from the thing being audited.** Each fact carries the columns it was built from, and the log is the union of those. Compiling the log separately from the read would let the two drift, and the requirement that a record reconstruct an answer's citations would become a thing to maintain rather than a property that holds.

**A guard proves itself the first time it fires on your own work.** Adding the audit table made the schema check fail, because the table carried a `member_id` and had not been declared. That is the check working, and it cost thirty seconds to satisfy honestly.

**Minimum-necessary finds reads nobody defended.** Being signed in was enough to read the whole record, on every question. Nothing chose that; it accumulated. Asking what each question actually needs removed four table reads from a plan-document answer and stopped the member's name being read at all.

## P3 Stage 3 - what writing the gap analysis taught

**Measure the deployment before describing it, even when the code is right in front of you.** The code pins a CA and verifies it, so "encryption in transit" would have been written up as done. The server accepts plaintext from any client that does not ask for TLS, and the pooler-to-database hop has none. Both facts took one query each and neither was visible in the source.

**A checklist of five controls will not name the paths the product added later.** The briefing's HIPAA list predates voice and email. A spoken answer containing a claim amount leaves to a vendor with no agreement, and no item on the list would have caught it. Walking the outbound calls found in a minute what re-reading the list would never have.

**State the limit of your own control.** Row-level security here filters on a value the application sets, so the trust boundary moved rather than left. Writing that down is worth more than the control is, because a reader who finds it themselves stops believing the rest.

**A document can have a regression test.** Every regulation named in the body must appear in the sources list, and the one control section that skipped the "what exists today" half failed the check. Both were real defects in the writing, caught the same way a code defect would be.

## P3 Stage 4 - what a second language taught

**A translated string on an untranslated rule refuses nothing.** The guardrail explanations were authored in Spanish and the match patterns stayed English, so a Spanish emergency reached no rule at all and the careful Spanish copy was unreachable. Translation is the visible half of internationalising a rule and the smaller half.

**Fetch the other edition and run it through the parser before assuming it is the same document.** The Spanish Summary of Benefits differs from the English by one character of case in its column header. Everything downstream depended on that character, and a parser that fails loudly instead of guessing is what turned it into a build error rather than two plans' amounts merged into one.

**A failure that is recorded as state will outlive its cause.** The conversion step skipped anything not marked `ok`, so after fixing the parser the same three documents kept reporting the old reason. Ten minutes were spent debugging a parser that was already correct.

**Do not hold a connection across a loop that sleeps.** The embedding loop pauses deliberately to stay under a token budget, and a pooler drops an idle connection. `pg` surfaces that as an unhandled error event rather than a rejected query, so a 40-minute job died at chunk 235 with no cleanup. One connection per unit of work costs a couple of hundred milliseconds and removes the failure mode.

**Translating an interface is an audit of what it claims.** The help panel said the assistant holds no member data and never signs you in. That was true when it was written and false for two stages. Nobody re-read it until somebody had to write it again in another language.

**A measured cost changes where new code goes.** D-069 measured that touching the answering system prompt moves faithfulness. So the Spanish instruction went on the user message instead, and an English prompt is byte-for-byte what it was. The measurement paid for itself a second time, in a stage written weeks later.

## P3 Stage 6 - what caching taught

**Read the idea's own warning before implementing it.** `docs/ideas.md` proposed semantic caching and, in the same sentence, described the failure it causes: two similar questions with different copays. The document that asked for the feature also contained the reason not to build it that way.

**A cache is only safe when emptying it changes nothing.** That property is worth asserting as a test rather than believing, because every shortcut that would break it looks like a performance win at the time.

**Do not run a formatter the repository does not use.** Prettier rewrote 330 lines of a file where the change needed ten, and broke three tests that match source text. There was no config and no other file was prettier-clean, which was checkable in one command before running it rather than after.

**Order matters in a chain of string replaces.** Stripping trailing punctuation before trimming leaves the punctuation on any input with a trailing space. The test caught it; reading the chain would also have caught it.

**Invalidate what can be wrong, not everything you can reach.** "Clear the caches on ingest" sounds prudent and is half wrong: two of the three could not go stale, and clearing them re-pays a provider bill to remove entries that were always correct. Working out which one actually depends on the thing that changed took less time than implementing the wrong answer would have.

**Put invalidation in a `finally`.** The state that needs the cache cleared most is the failed run: a half-written corpus with a full cache is a fast wrong system. "On success" skips exactly the case that matters.

## P3 Stage 7 - what feedback taught

**Check whether the feature exists before building it.** Feedback had been recorded since v1.0.0, and the operator report had shown the split just as long. The real gap was one column: the answer that was rated. Half an hour of reading turned a feature request into a much smaller change.

**"Anonymised" is usually a word, not a property.** A session id links every question in one visit and the loop breaker needs it, so the store is pseudonymous whatever the documentation says. The useful move was to make the analysis surface blind to it and then use the accurate word, rather than claim the stronger one.

**Free text is the hole in a zero-PHI boundary.** Every other field in this system is a number, an enum or a redacted question. A text box invites a member to type a diagnosis, and no amount of identifier redaction catches that. Four fixed reasons are less rich and are the only version that keeps the boundary intact.

**Do not build toward a pipeline that does not exist.** The request asked for data shaped for fine-tuning. There is no training path here and the answers come from retrieval and a prompt, so the honest destination was the golden set, which already gates every release.

## P3 Stage 8 - what the export taught

**Check whether the button already works, twice in a row now.** The request opened with "if not already", and it already did: `window.print()` over a print stylesheet, tested, shipped since P2. The feature was not "make the button work" but "the dialog is not a download", which is a much narrower change and a different justification.

**A dynamic import is the answer to "we cannot afford that dependency".** The reflex objection to jsPDF is 130 kB gzipped on an audience with slow connections. Loading it on press moves that cost onto the people who asked for it and leaves the initial bundle untouched, which turned a refusal into a one-line `await import`.

**Ask where the rendering happens before asking which library.** The server option was the tempting one and was wrong for a reason that has nothing to do with PDFs: it would have posted a signed-in member's claim amounts to an endpoint and into its logs, undoing Stage 2 for exactly that data. The library question only mattered after that was settled.

**Separate the document from its typesetting.** Making `transcriptBlocks` return plain data meant every assertion about what the file says is a string comparison, and not one test parses a PDF. The renderer then holds nothing but sizes and spacing, which is the part a test could not usefully check anyway.

**Read the artifact, not the test output.** Rendering a sample and looking at it caught two things no test would have: body type set smaller than the 18px the product holds itself to on screen, and a cited headline amount dropped from the export because it lives in its own field rather than in a claim.

**A shared predicate written for a new feature exposed an old bug.** The export needed to know whether a turn came from the member's record. The existing answer to that question matched only the English citation label, so signing out in Spanish left claim data in storage. One predicate, both callers, and a regression test.

## P3 Stage 9 - what the comment sweep taught

**A mechanical edit needs a mechanical check.** A regex stripping identifiers from 411 comment lines left "This is why exists", "failing loudly is's rule", and a punctuation rule that turned `0..1` into `0.1` in the reranker. The regex was not the mistake; running it without reading the diff would have been.

**Tests that match source text are a hidden coupling.** Three broke on comment prose, one of them slicing the file from a comment string as an anchor. Two were re-anchored on code. The third stayed, because "the source explains why" is genuinely what it asserts, and that is the difference worth knowing.

**A rule without a gate decays.** The comment rule has been in `CLAUDE.md` since the first commit and 411 lines ignored it. The durable output of this stage is not the sweep, it is the twenty-line test that fails on the next one.

**Ask when a request contradicts itself.** "Sweep everything including `claude/`" and "add a stage entry to `plan-p3.md`" cannot both be done. Naming the contradiction took one question and changed the scope of the work.

**Count before publishing a count.** The `chunks` table holds 3,345 rows, and only 2,737 belong to the current snapshot; the rest are an older ingest left unreachable. The number that was easy to reach was 22% wrong.

**`--` is not always a comment.** The comment extractor treated CSS custom properties as SQL comments. It changed nothing in the end, but the first version of the gate was scanning `--color-forest-ink` as prose.
