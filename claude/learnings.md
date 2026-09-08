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
