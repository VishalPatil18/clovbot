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
