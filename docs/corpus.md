# Where the data came from

Every answer this assistant gives is grounded in a document it fetched itself from
`cloverhealth.com`. Nothing was hand-copied, nothing was uploaded, and no dataset
was downloaded from anywhere else. This page records exactly what was taken, how,
and how much of it reached the index.

**All figures below are measured** from snapshot `2026-09-09T0517Z` and the live
database on 2026-09-09, not estimated.

---

## 1. Scope: what was collected, and why only this

| Field | Value |
| --- | --- |
| Site | `https://www.cloverhealth.com` |
| Zipcode | 07030 (Hoboken) |
| County | FIPS 34017, Hudson County, New Jersey |
| Plan year | 2026 |
| Plans | H5141-004, H5141-007, H8010-002 |
| Languages | English and Spanish |

One county, one plan year, three plans. A Medicare Advantage plan's benefits are
county-specific and year-specific, so "what does a specialist visit cost" has no
answer until both are pinned. Widening the scope would multiply the corpus without
making a single answer better, and would make it easy to return a document that
does not apply to the member asking.

The scope lives in one place, [`src/corpus/scope.ts`](../src/corpus/scope.ts), and
is imported by the corpus commands, ingest, the API and the eval harness. Adding a
plan is one record.

---

## 2. Discovery: how the URLs were found

No scraping of HTML link graphs, and no guessing at file paths. Clover publishes
two JSON endpoints that its own site uses, and both are read directly:

```
GET /api/zipcode/counties?zipcode=07030
GET /api/plans/document-search?county_id=34017&year=2026
```

The first resolves a zipcode to a county; the result is checked against the county
in the scope and the run fails if they disagree. The second returns the plan
catalog: for each plan, a map of document kind to language to URL. That is where
every Evidence of Coverage, Summary of Benefits and Annual Notice of Change URL
comes from, in both languages.

Two documents are not in the catalog. The **drug list** and the **pharmacy
directory** are filer documents, matched by filename pattern (`formulary_ch_nj`,
`pharmacy_directory_nj`) once the catalog has been resolved.

Seven **corporate pages** are listed explicitly, because they are prose pages
rather than plan documents:

```
/about-us/about-clover        /understanding-medicare/medicare-faq
/about-us/press               /understanding-medicare/insurance-term-faq
/about-us/leadership          /members/supplemental-benefits
```

`/about-us/investors` is in the list and excluded: it redirects off-domain to an
external investor-relations host that does not respond, and that host is outside
the corpus.

A plan's documents are checked against the state in the CDN filename
(`_nj_`, `_tx_`, `_ga_`…) so a catalog entry for another state cannot be indexed
under a New Jersey plan.

---

## 3. Fetching: the rules it follows

| Rule | How |
| --- | --- |
| `robots.txt` is honoured | Fetched first and parsed for the wildcard agent; a disallowed path is recorded as `blocked` and never requested |
| One request at a time | Serial, never parallel |
| 1,500 ms between requests | `DELAY_MS` in [`src/corpus/cli.ts`](../src/corpus/cli.ts) |
| Identified honestly | `User-Agent: clovbot-casestudy/0.1 (Clover Health interview case study; contact via repository)` |
| Every byte fingerprinted | SHA-256 recorded per document, so a re-fetch that changes nothing re-embeds nothing |

Nothing is retried aggressively and nothing is fetched that `robots.txt` disallows.
In the recorded snapshot, **zero documents were blocked and zero failed.**

---

## 4. What was actually retrieved

29 documents attempted. **26 fetched, 3 synthetic, 0 failed, 0 blocked.**

| Kind | Count | Language | Source |
| --- | --- | --- | --- |
| Evidence of Coverage | 6 | 3 English, 3 Spanish | Catalog |
| Summary of Benefits | 6 | 3 English, 3 Spanish | Catalog |
| Annual Notice of Change | 6 | 3 English, 3 Spanish | Catalog |
| Corporate pages | 6 | English | Explicit list |
| Drug list (formulary) | 1 | English | Filer document |
| Pharmacy directory | 1 | English | Filer document |
| Provider directory | 3 | English | **Synthetic, generated** |

**29.0 MB raw. 1,726 PDF pages.**

The **provider directory is the one thing not fetched.** Clover's real directory is
a search interface rather than a document, and inventing plausible doctors would be
the worst possible failure for this product: a member calling a practice that does
not exist. Instead, three generated directories carry an explicit `DEMO DATA`
roster, every provider question is answered with that label attached, and the
assistant refuses to say whether a named doctor is in network.

The **pharmacy directory is fetched but never indexed.** As prose it is hundreds of
near-identical address rows that swamp lexical search, so it is excluded at ingest
([`EXCLUDED_KINDS`](../src/rag/ingest.ts)).

---

## 5. Conversion: PDF to text

No PDF library is bundled. Conversion shells out to **poppler**, which is the only
external binary this project needs:

| Tool | Flags | Used for |
| --- | --- | --- |
| `pdftotext` | `-layout` | Everything except the Summary of Benefits: layout-preserving text |
| `pdftotext` | `-bbox-layout` | Word coordinates, for column splitting and the drug list |
| `pdfinfo` | | Page counts |

HTML pages are converted by a small extractor in
[`src/corpus/convert.ts`](../src/corpus/convert.ts) that takes the `#content`
region when present and the `<body>` otherwise, strips scripts, styles and tags,
and decodes entities. No HTML parsing library.

**4.25 MB of text out of 29.0 MB of PDF.**

Every converted file is checked against a **byte floor** for its kind (100 KB for
an Evidence of Coverage, 50 KB for the drug list, 500 bytes for a corporate page).
A conversion that reports success and emits nothing is the failure that looks like
a pass, and the floor is what catches it.

### The Summary of Benefits problem

One PDF describes **two plans in two columns**. Read as text, the columns merge and
a member gets the other plan's copay. It is parsed from **word coordinates**
instead:

1. Find the page's `(Plan NNN)` header words; the plan id is the token after `(Plan`.
   The Spanish edition writes `(plan 004)` in lower case, so the match ignores case.
2. Compute the **gutter**: the x that the fewest words cross. Not the midpoint
   between headers, which are centred in their own column and whose midpoint lands
   inside the left column's text.
3. Measure the gutter **per page**. Recto and verso have different margins, so
   inheriting one page's absolute boundary cuts words in half on the next.
4. Split **per line**, not per page: a page can mix a two-column table with
   full-width prose, and cutting the prose at the column boundary drops half of
   every sentence.
5. A page whose columns cannot be attributed to a plan **fails the build** rather
   than emitting an amount that might belong to either.

### The drug list

Parsed from bounding boxes into **typed rows**, not prose. A fact that lives in a
table wants a table query. Class headings are detected as mostly-uppercase lines,
"mostly" because `HMG-CoA` and `(DMARDS)` are real headings and requiring every
character to be uppercase silently filed ten statins under the wrong class.

**4,932 rows, 2,466 distinct drug names**, in the `drugs` table.

---

## 6. Chunking

| Setting | Value |
| --- | --- |
| Split by | Heading structure, then size |
| Maximum | 2,400 characters |
| Minimum (corporate) | 80 characters |
| Contextual prefix | Derived from the heading path; averages 126 characters |

The Evidence of Coverage opens with a table of contents whose entries look exactly
like headings, so the body starts at the first bare `CHAPTER n:` line.

Every chunk carries a **contextual prefix** naming where it came from, prepended
before embedding and lexical indexing but never shown to a member. For roughly 95%
of chunks that prefix is derived from the heading path, which is free and
deterministic. Only chunks with no heading to inherit from are sent to the model,
and those generated prefixes are **frozen to disk**: the model is not deterministic,
so regenerating them each run would report unchanged chunks as changed and re-embed
them forever.

---

## 7. Embedding and indexing

| Setting | Value |
| --- | --- |
| Model | Azure OpenAI `text-embedding-3-small` |
| Dimensions | 1,536 |
| Batching | By token budget, 5,000 tokens per batch |
| Pacing | Sleeps between batches to stay under `AZURE_EMBEDDING_TPM` (29,000) |
| Change detection | SHA-256 per chunk; unchanged chunks are never re-embedded |

**What reached the index, in snapshot `2026-09-09T0517Z`: 2,737 chunks across 28 documents.**

| Kind | English | Spanish | Documents |
| --- | --- | --- | --- |
| Evidence of Coverage | 939 | 727 | 6 |
| Drug list | 720 | - | 1 |
| Summary of Benefits | 111 | 34 | 6 |
| Annual Notice of Change | 73 | 63 | 6 |
| Corporate pages | 67 | - | 6 |
| Provider directory (synthetic) | 3 | - | 3 |
| **Total** | **1,913** | **824** | **28** |

Average chunk: 1,450 characters. Largest: 2,399.

28 indexed of 29 fetched: the pharmacy directory is deliberately excluded (§4).
The `chunks` table also holds 608 rows under an older snapshot id. They are
unreachable rather than deleted, because retrieval scopes by snapshot id, and
`search_hybrid` never sees them.

Each chunk is stored with a dense vector (HNSW index) and a generated
`tsvector` (GIN index) stemmed **in the chunk's own language**. Running Spanish
text through the English configuration strips English stopwords and stems nothing,
which quietly makes the lexical half of hybrid retrieval useless on a third of the
corpus.

---

## 8. Reproducing it

```bash
npm run corpus:discover   # resolve county, read the catalog, write the manifest
npm run corpus:fetch      # robots.txt, 1.5s apart, sha256 each
npm run corpus:convert    # poppler; column split for the Summary of Benefits
npm run corpus:report     # what succeeded, what failed, what came in under floor
npm run ingest            # chunk, prefix, embed, upsert; parse the drug list
```

Each command writes into `data/snapshots/<id>/` and updates `manifest.json`. The
snapshot is the unit of reproducibility: the manifest records every URL, its
SHA-256, its status, its page count and its converted size.

The retrievability report for the current snapshot is
[`docs/corpus-report.md`](./corpus-report.md).

---

## 9. Libraries used

The honest answer is **almost none**. This pipeline is Node's own `fetch`, two
poppler binaries, and hand-written parsers.

| Job | What does it |
| --- | --- |
| HTTP | `fetch`, built into Node 26 |
| `robots.txt` | ~20 lines in [`src/corpus/fetch.ts`](../src/corpus/fetch.ts) |
| PDF text and coordinates | `pdftotext`, `pdfinfo` (poppler, external binaries) |
| HTML to text | ~40 lines in [`src/corpus/convert.ts`](../src/corpus/convert.ts) |
| Column geometry | [`src/corpus/columns.ts`](../src/corpus/columns.ts) |
| Drug list parsing | [`src/corpus/formulary.ts`](../src/corpus/formulary.ts) |
| Chunking | [`src/rag/chunk.ts`](../src/rag/chunk.ts) |
| Hashing | `node:crypto` |
| Database | `pg` 8.23.0 |
| Embeddings | Azure OpenAI over `fetch` |
| Reranking | `@huggingface/transformers` 4.2.0, `Xenova/ms-marco-MiniLM-L-6-v2` locally |

No scraping framework, no PDF library, no HTML parser, no chunking library, no
vector-store client.

---

## 10. What this corpus cannot answer

Stated here because a corpus page that lists only what it holds is misleading.

- **Whether a named doctor is in network.** The directory is generated demo data.
- **Anything about a plan outside Hudson County, New Jersey, for 2026.**
- **Pharmacy locations.** Fetched, deliberately not indexed.
- **A drug list in Spanish.** Clover publishes none, so a Spanish drug answer cites
  the English list and says so.
- **Clover's real support hours.** Not sourced, so never stated.
