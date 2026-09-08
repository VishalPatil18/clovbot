# Features Log

> Append-only log of features. Each entry is the final shape of one feature cycle.
>
> Written by `/spec-feature`. Read by `/spec-docs` and `/spec-bug`.

---

<!-- Template for each feature. Copy below this line for new features. -->

## Feature: _<feature name>_

| Field            | Value                 |
| ---------------- | --------------------- |
| Shipped          | _<YYYY-MM-DD>_        |
| Cycle            | _<sequential number>_ |
| Stage of plan.md | _<stage number>_      |
| Owner            | _<user or claude>_    |

### Phase 1 - Requirements

_<Cross-questioning transcript summary. The questions asked and the answers received.>_

### Phase 2 - Architecting

**Options considered:**

1. _<option A>_ - pros / cons
2. _<option B>_ - pros / cons

**Chosen:** _<A or B>_ - _<one-line rationale>_

### Phase 3 - Product Specs

- **UI:** _<screens, components>_
- **UX flow:** _<steps>_
- **Frontend entities:** _<list>_
- **Backend entities:** _<list>_
- **DB schema:** _<tables / collections>_

### Phase 4 - Tech Specs

- **Frameworks:** _<chosen + rejected>_
- **Languages:** _<chosen>_
- **Deployment:** _<target>_
- **Data store:** _<chosen + rejected>_

### Phase 5 - Planning

| Sub-stage | Goal     | Acceptance   |
| --------- | -------- | ------------ |
| 1         | _<goal>_ | _<criteria>_ |
| 2         | _<goal>_ | _<criteria>_ |

### Phase 6 - Writing Code

- **Files touched:** _<list>_
- **Tests added:** _<list>_
- **Refactor scope:** _<files cleaned by `/spec-refactor`>_
- **Memory updates applied:** [ ] context.md [ ] design-decisions.md [ ] learnings.md [ ] CHANGELOG.md

---

## Feature: Corpus spike - fetch and convert (Stage 1)

| Field            | Value                 |
| ---------------- | --------------------- |
| Shipped          | _in progress_         |
| Cycle            | 1                     |
| Stage of plan.md | `plan-p1.md` Stage 1  |
| Owner            | user + claude         |

### Phase 1 - Requirements

Interrogation run against `plan-p1.md` Stage 1, `srs.md` FR-01/FR-04/§7/§10, D-019, and `docs/testing-strategy.md`. Sixteen questions asked across corpus scope, network authorization, dependencies, artifact layout and acceptance detail. Answers:

| # | Question | Answer |
| --- | --- | --- |
| 1 | Service area and PBP | New Jersey confirmed. PBP selection is Stage 1's job. |
| 2 | Provider and pharmacy directories | Build synthetic data for demo purposes. |
| 3 | Corporate / investor-relations content | In scope for this stage. |
| 4 | Authorized to fetch cloverhealth.com live | Yes. |
| 5 | If a document is blocked | Manual browser download with step-by-step instructions; HR outreach as a last resort. |
| 6 | Politeness posture | Confirmed: sequential, delayed, descriptive User-Agent. |
| 7 | PDF to markdown converter | Claude's recommendation. |
| 8 | HTML to markdown converter | Claude's recommendation. |
| 9 | Zod at the file-read trust boundary | Deferred. Hand-rolled validation, consistent with the Vitest-only toolchain. |
| 10 | Where fetched documents live | `data/`, gitignored. |
| 11-16 | Fixtures, manifest, report, module layout, byte floors, command split | Claude's recommendation. |

**Concern raised and overruled by the user:** synthetic provider data conflicts with `CLAUDE.md` rule 6 (no invented Clover facts). Accepted with the mitigation that synthetic sources carry a `synthetic` status in the manifest and a provenance flag forcing every citation drawn from them to render as demo data. Reconnaissance later reduced the exposure: the NJ pharmacy directory is published as a real PDF, so only the provider directory needs synthetic data.

### Phase 1 findings - live reconnaissance

Run before any code, because Stage 1's whole purpose is to replace assumptions with measurements.

- **`robots.txt` is `Allow: /`** with no restriction on document paths. No manual download or HR outreach is needed.
- **Two undocumented JSON endpoints back the plan-documents page**, which is a React app rendering nothing useful in server HTML:
  - `/api/zipcode/counties?zipcode=<zip>` returns the FIPS county id.
  - `/api/plans/document-search?county_id=<fips>&year=<yyyy>` returns a structured catalog: `contract_id`, `plan_id`, `year`, `network_type`, `rx_coverage`, and direct CDN URLs for Summary of Benefits, Evidence of Coverage and ANOC in English and Spanish.
  - `zipcode=` is accepted and silently ignored. Only `county_id` filters. Passing the wrong parameter returns all ten plans across five states with no error.
- **Contract id is H5141.** Hudson County NJ (FIPS 34017) resolves to six plans, four of them PPO.
- **Conversion is viable.** Measured with `pdftotext -layout` (poppler, already installed):

  | Document | Pages | Converted | Content survival |
  | --- | --- | --- | --- |
  | `25mx072b3_eoc_nj_ppo_004_508.pdf` | 199 | 498 KB in 0.25s | section structure and copays intact |
  | `25ex044d1_summary_of_benefits...nj_004-007.pdf` | 16 | 50 KB | cost-sharing tables intact |
  | `25mx108a_2026_formulary_ch_nj...pdf` | 123 | parsed | `ARIKAYCE SUSP 590mg/8.4ml / tier 5 / NM, PA` |

- **Load-bearing defect found: the Summary of Benefits is a two-plan comparison document.** One PDF covers plans 004 and 007 in side-by-side columns. Under `-layout` both plans' amounts land on one text line (`Specialist visit: $10 copay` and `Specialist visit: $2 copay`), and the header naming the columns appears once per page section, roughly eighteen lines above. A naive chunker would hand the model both amounts with no way to distinguish them, on the highest-volume bucket A call driver. The result would retrieve real content, cite a real document, pass a faithfulness check, and be wrong for one of the two plans. This is the class of failure Stage 1 exists to surface before anything is built on top of it.

  It also qualifies D-019: "one plan, one service area" does not hold at the document level, because the source document is inherently two-plan. Disambiguation has to happen at conversion.

### Phase 1 decisions taken by the user

- **PBP: H5141-004, Clover Health Choice (PPO), Hudson County NJ.** PPO per D-019 and carries Part D, so formulary call drivers remain answerable. The rejected Valor-061 has `rx_coverage: false` and would have silently removed a whole call-driver class. **Revised mid-cycle to two plans, 004 and 007, per D-033**, so that FR-10 and FR-11 can be demonstrated rather than asserted; the pair shares one Summary of Benefits and both carry Part D.
- **Summary of Benefits column disambiguation: bbox column split.** `pdftotext -bbox-layout` emits per-word x/y coordinates; each cell is assigned to plan 004 or 007 by x-position against the header, and only the 004 column is emitted. Rejected: character-offset splitting (silently corrupts on any row wrapping past the boundary) and dropping the SoB entirely (loses the document members are actually mailed).

### Phase 2 - Architecting

**Options considered:**

1. **Live API discovery every run** - self-updating and catches upstream republishing, but nothing runs offline and an undocumented endpoint becomes a single point of failure.
2. **Pinned URL list** - fully reproducible and trivially testable, but goes stale silently and forecloses the nightly upstream-drift test.
3. **Discovery snapshot, replayed** - `--discover` writes a timestamped catalog snapshot; the default run replays the committed one.

**Chosen:** 3. Reproducibility and drift detection are both required and only option 3 delivers both; the snapshot doubles as the immutable artifact Stage 4 needs for ingest idempotency. Logged as D-030. The column-disambiguation and PBP decisions are logged as D-031 and D-032.

### Phase 3 - Product Specs

- **UI:** None. Stage 1 is a command-line spike with no member-facing surface. Output is files on disk plus a written report.

- **UX flow** (the operator, not a member):
  1. `npm run corpus:discover` calls the county and document-search endpoints, writes a timestamped snapshot directory containing the verbatim catalog response.
  2. `npm run corpus:fetch` reads the newest snapshot, downloads every document it names with a politeness delay, records status, bytes, page count and sha256 per document.
  3. `npm run corpus:convert` converts each fetched document to markdown; single-column sources through `pdftotext -layout`, the Summary of Benefits through the bbox column split.
  4. `npm run corpus:report` renders the retrievability report from the manifest.
  5. Operator opens the converted Summary of Benefits and checks a copay against the source PDF by hand.

- **Frontend entities:** None.

- **Backend entities:**

  | Entity | Fields |
  | --- | --- |
  | `CatalogPlan` | `contract_id`, `plan_id`, `year`, `name`, `network_type`, `rx_coverage`, `documents` |
  | `SourceDocument` | `id`, `kind`, `url`, `plan_id`, `contract_id`, `plan_year`, `language` |
  | `ManifestEntry` | `document_id`, `status`, `url`, `retrieved_at`, `bytes`, `pages`, `sha256`, `robots_allowed`, `converted_bytes`, `failure_reason` |
  | `Snapshot` | `id`, `created_at`, `county_id`, `plan_year`, `catalog`, `entries` |

- **DB schema:** No database in this stage; Stage 3 introduces Supabase. The on-disk snapshot is the store:

  ```
  data/snapshots/<iso8601>/
    catalog.json      verbatim API response
    manifest.json     ManifestEntry[]
    raw/<id>.pdf|html
    markdown/<id>.md
  ```

  `status` is a closed union: `ok` | `failed` | `blocked` | `synthetic`. Never blank, per the acceptance criteria.

### Phase 4 - Tech Specs

- **Framework:** None. Node scripts invoked through npm, consistent with the Vitest-only toolchain. *Rejected:* a CLI framework such as commander, because four scripts with no flags beyond `--discover` do not justify a dependency.
- **Language:** TypeScript, strict, matching the existing `tsconfig.json`.
- **Deployment target:** None. Developer machine and CI only; this stage produces artifacts, not a service.
- **Data store:** Timestamped directories on disk under `data/`, gitignored. *Rejected:* committing the corpus to git, because the EOC alone is 6.7 MB and would be rewritten on every refresh. *Rejected:* a database this stage, because Stage 3 owns schema decisions and introducing one here would pre-empt them.
- **PDF conversion:** `pdftotext` from poppler, already installed. *Rejected:* `unpdf` and `pdfjs-dist`, which are new packages that would need bbox handling written anyway. *Rejected:* Python `docling` or `markitdown`, best table fidelity but a second runtime and a heavy install for a gain `-bbox-layout` already delivers. **Known cost:** poppler is a system binary and not in `package.json`, so it is a documented prerequisite. Acceptable because per `docs/testing-strategy.md` §8 commit-time tests replay committed fixtures and never invoke it; only the operator and the nightly runner need it.
- **HTML conversion:** Hand-rolled extraction scoped to the page's `#content` element, emitting plain text. *Rejected:* `turndown` plus an HTML parser, two dependencies to produce markdown structure that the corporate and investor-relations pages, which are prose, do not carry. Verified feasible during reconnaissance.
- **Validation:** Hand-rolled, per the user's Zod deferral. Applied at both trust boundaries this stage has: the API response and the manifest file read.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 1a | Discovery and snapshot | County and catalog responses parse into typed values; a response that is not county-scoped or carries a non-2026 plan is rejected loudly; snapshot directory written with verbatim catalog |
| 1b | Fetch and manifest | Every document downloads with politeness delay and sha256; every attempt produces a `ManifestEntry` with a non-blank status; a 404 records `failed` with a reason rather than throwing |
| 1c | Single-column conversion | EOC, formulary, pharmacy directory and HTML pages convert; each `ok` document has markdown above a per-kind byte floor; formulary markdown contains a drug name with its tier |
| 1d | Summary of Benefits column split | Words assign to plan 004 or 007 by x-position; each plan is emitted separately with its benefit labels attached; a document with no header fails loudly; both specialist copays match the source PDF |
| 1e | Synthetic provider directory | Generated directory carries `status: synthetic` and a provenance flag; no synthetic entry is representable without it |
| 1f | Report and wiring | `corpus:report` renders every failure with a reason; npm scripts wired; full suite green |


### Phase 6 - Writing Code (Stage 1)

- **Files touched:** `src/corpus/{types,discover,fetch,convert,columns,synthetic,report,snapshot,cli}.ts`, `tests/unit/corpus-{discover,columns,fetch,convert,synthetic,report}.test.ts`, `tests/fixtures/corpus/live/*`, `.env.example`, `.gitignore`, `package.json`, `tsconfig.json`, `docs/corpus-report.md`.
- **Tests added:** 76 unit tests. No integration tests, by the user's call.
- **Dependencies added:** `@types/node@26.5.0` (types only). `pdftotext` and `pdfinfo` from poppler are documented system prerequisites, not packages.
- **Result:** 14 documents fetched, 0 failed, 0 blocked, 2 synthetic. Both plans' Summary of Benefits extracted to separate markdown with no cross-plan leakage.

**Defects the live run surfaced, all fixed:**

1. The formulary and pharmacy directory are linked from `/members/formulary`, not `/members/plan-documents`. Discovery scans both.
2. `/about-us/investors` redirects off-domain to an investor-relations host that does not respond. Dropped from the corpus, since the corpus is cloverhealth.com public content.
3. The Summary of Benefits conversion wrote raw two-column text over the extracted column, because it looped over both plans inside each plan's own entry. Each entry now converts its own column.
4. The header midpoint is not the column break, since headers are centred within their column. Replaced with a gutter search for the x-coordinate that the fewest words cross; crossings fell from 5-25 per page to zero on 11 of 12 table pages.
5. Page 15 mixes a two-column rewards table with full-width disclaimer prose. A page-level split truncated every disclaimer sentence. Splitting is now decided per line.

---

## Feature: Thinnest end-to-end answer (Stage 3)

| Field            | Value                |
| ---------------- | -------------------- |
| Shipped          | 2026-09-07           |
| Cycle            | 2                    |
| Stage of plan.md | `plan-p1.md` Stage 3 |
| Owner            | user + claude        |

### Phase 1 - Requirements

Stage 2, the voice latency spike, was skipped at the user's instruction. It is a spike rather than a dependency of Stage 3, so ordering permits it. The cost is that NFR-PERF-03 and NFR-PERF-04 stay unmeasured until Stage 9, which is the risk the plan put Stage 2 early to avoid.

| # | Question | Answer |
| --- | --- | --- |
| 1-3 | Datastore | Supabase, project created by the user, schema applied by hand through the dashboard |
| 4 | Azure credentials | Exist. Embeddings verified at 1536 dimensions; chat verified |
| 5 | Fallback if Azure unavailable | Add Gemini as a fallback |
| 6 | Which plan answers "the specialist copay" now that two are indexed | Index both, CLI takes `--plan` |
| 7 | Postgres client | `pg` |
| 8 | Azure SDK | Raw `fetch`, no vendor SDK |
| 9 | `@types/node` | Approved |
| 10 | Integration tests | None for now |

### Phase 2 - Architecting

**Options considered:**

1. **Fallback for generation and embeddings alike** - symmetrical, and silently wrong: two providers embed into different vector spaces, so a Gemini-embedded query against an Azure-embedded corpus returns numerically valid, semantically meaningless chunks. Retrieval would not error; cite-or-refuse would dress the result as a confident cited wrong answer.
2. **Fallback for generation only** - the chunks are already retrieved and passed in the prompt, so the fallback reads the same evidence and cites the same identifiers.
3. **No fallback** - an Azure outage ends the demonstration.

**Chosen:** 2. Logged as D-034, together with the exposure the user accepted: Google may train on free-tier input, so FR-31 redaction had to move ahead of the model call rather than only ahead of the log write.

### Phase 3 - Product Specs

- **UI:** None. A command-line entry point: `npm run ask -- "<question>" --plan <004|007>`.
- **UX flow:** question in, redact identifiers, embed, retrieve top-5 filtered by plan, generate with citations, print answer then a Sources block naming document, contract, plan, plan year and section, write the turn log.
- **Backend entities:** `CorpusChunk`, `PromptChunk`, `RetrievedChunk`, `TurnRecord`.
- **DB schema:** `chunks` (id, snapshot_id, document_id, kind, contract_id, plan_id, plan_year, section, content, `vector(1536)`, created_at) with an HNSW cosine index per D-005 and a `(contract_id, plan_id, plan_year)` index per D-033. `turns` per FR-26.

### Phase 4 - Tech Specs

- **Framework:** none; Node scripts. *Rejected:* a CLI framework, for two commands.
- **Language:** TypeScript, strict.
- **Deployment:** none this stage. Developer machine against hosted Supabase.
- **Data store:** Supabase Postgres with pgvector. *Rejected:* local Postgres in Docker, which adds a system prerequisite; the free tier is enough for one plan year of one document. **Known cost:** the free tier pauses after 7 days idle and must be woken before a demonstration.
- **Model access:** raw `fetch` against both REST APIs. *Rejected:* the `openai` and Google SDKs, since two endpoints do not justify two dependencies. **Cost:** retry and streaming are hand-written when Stage 6 and FR-08 need them.
- **TLS:** Supabase's pooler serves a self-signed chain. Their CA is pinned at `certs/supabase-ca.crt` with verification left on, rather than disabling certificate checking.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 3a | FR-31 redaction | Identifier shapes removed, ordinary numbers, dollar amounts and plan years survive |
| 3b | Naive chunker | Header-aware, stable ids, provenance on every chunk, no amount lost |
| 3c | Prompt and citation containment | Sources fenced as data, citation required, a citation to an unretrieved chunk detected |
| 3d | Providers | Azure embeddings with no fallback, Azure generation falling back to Gemini |
| 3e | Store and retrieval | Plan filtered in SQL before ranking, idempotent re-ingest |
| 3f | CLI and turn log | Cited answer at a terminal, turn row written |


### Phase 6 - Writing Code (Stage 3)

- **Files touched:** `src/rag/{chunk,prompt,providers,store,cli}.ts`, `src/logging.ts`, `certs/supabase-ca.crt`, `.env.example`, `migrations/`.
- **Tests added:** 35. **Dependencies added:** `pg@8.23.0`, `@types/pg`.
- **Result:** `npm run ask -- "what is the specialist copay" --plan 004` returns $10 in-network and $20 out, cited to document, contract, plan, plan year and section, in about 1.4s. Plan 007 returns $2 and $15 from the same source PDF.

**Defects surfaced and fixed:** the refusal outcome logged `answered` because `retrieved.length === 0` never fires when vector search always returns top-k; TLS verification was initially disabled and was replaced with a pinned Supabase CA.

---

## Feature: Full ingest and hybrid retrieval (Stage 4)

| Field            | Value                |
| ---------------- | -------------------- |
| Shipped          | 2026-09-08           |
| Cycle            | 3                    |
| Stage of plan.md | `plan-p1.md` Stage 4 |
| Owner            | user + claude        |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | The pre-written stubs encode `contractId: "H5141-001"`, merging contract and plan | Rewrite stubs and tests to reality |
| 2 | D-006 contextual prefixes would cost one model call per chunk | Deterministic from headings; model only where no heading exists |
| 3 | Formulary and pharmacy directory are 41% of chunks and are tables | Index the formulary, exclude the pharmacy directory |
| 4 | What "snapshot id unchanged" means for idempotency | Ingest reuses the corpus snapshot id |
| 5 | Migration | Applied by hand in the Supabase dashboard |
| 6 | The pre-existing integration tests | Delete |

### Phase 2 - Architecting

**Options considered:**

1. **Rewrite the stale stubs and tests to reality** - one code path, identifiers matching the real corpus.
2. **Two tracks** - in-memory fixture retrieval for tests, Postgres for production. Two paths that drift.
3. **Delete and start fresh** - loses the adversarial fixture cases, which `docs/testing-strategy.md` section 4 calls the linchpin.

**Chosen:** 1. The stubs predated Stage 1 and could not be implemented as written without reintroducing cross-plan leakage. The adversarial cases were kept and their identifiers corrected.

### Phase 3 - Product Specs

- **UI:** None. `npm run ingest`, and `npm run ask -- "<question>" --plan <004|007> [--mode hybrid|dense|lexical]`.
- **Backend entities:** `ChunkInput`, `CorpusChunk` (now carrying `contextPrefix`, `embedText`, `needsGeneratedContext`), `PlannedIngest`, `RejectedDocument`.
- **DB schema:** `chunks` gains `context_prefix` and a generated `search_vector tsvector` with a GIN index. `search_hybrid()` performs plan-scoped RRF over both halves.

### Phase 4 - Tech Specs

- **Lexical half:** Postgres `tsvector` with `websearch_to_tsquery`, generated column so the index cannot drift from the text. *Rejected:* an external search service, which is neither zero-cost nor a single datastore.
- **Fusion:** one SQL function, mirrored by `fuseRrf` in TypeScript so ranking is testable without a database.
- **Pacing:** token-budget batching against the measured 29,000 tokens-per-minute quota, with `Retry-After` honoured.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 4a | Remove the stale layer | Nothing imports `pipeline.ts` or `corpus.ts`; suite still green |
| 4b | Provenance and plan-year gate | Raises rather than defaulting; 2025 rejected |
| 4c | RRF | Both-list chunk ranks first; ties deterministic |
| 4d | Chunker for all kinds | Headings per kind; table of contents ignored |
| 4e | Migration and hybrid search | Plan filtered before ranking |
| 4f | Idempotent ingest | Two runs, 0 changed, same snapshot id |

### Phase 6 - Writing Code

- **Files touched:** created `src/rag/{provenance,ingest,context}.ts`, `migrations/002_hybrid_retrieval.sql`, `scripts/stage4-check.ts`; rewrote `src/rag/{chunk,store,cli}.ts`, `src/retrieval.ts`, `src/types.ts`; deleted `src/pipeline.ts`, `src/corpus.ts`, `tests/integration/`.
- **Tests added:** 39 (chunker 17, ingest 12, provenance 11, fusion 5 now passing).
- **Measured results:** 1476 chunks. Idempotency 0 changed across two runs. Smoke set 10/10. ORSERDU dense rank 9 versus hybrid rank 1. Paraphrase absent from lexical, hybrid rank 2.

**Defects the live run surfaced, all fixed:**

1. **Duplicate chunk ids caused silent content loss.** Corporate pages share headings, and the id omitted the document, so twelve chunks overwrote each other on upsert.
2. **Generated context broke idempotency**, because the model is not deterministic. Frozen to `context-prefixes.json`.
3. **The Azure quota is 29,000 tokens per minute, not requests.** Retry alone could not clear it; pacing and per-batch persistence could.
4. **The first fusion check could not fail**, because it matched any chunk from the right document rather than the chunk containing the term.
5. Corporate chunks fell from 342 to 67 once web-page furniture stopped being treated as headings, and HTML entity decoding was widened to numeric entities.


---

## Feature: Golden set and eval harness (Stage 5)

| Field            | Value                |
| ---------------- | -------------------- |
| Shipped          | 2026-09-08           |
| Cycle            | 4                    |
| Stage of plan.md | `plan-p1.md` Stage 5 |
| Owner            | user + claude        |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | Reranker, the last load-bearing open question | Local ONNX cross-encoder (D-037) |
| 2 | Who pins the 50 golden answers | Claude drafts and self-verifies against the corpus; user spot-checks a sample |
| 3 | Bucket B and C cases with no confidence floor yet | Mark not-yet-enforced, so Stage 6's gain is visible rather than assumed |
| 4 | Judge cost per run | Add `--sample N` for fast iteration |

### Phase 2 - Architecting

**Options considered:** score refusals as real passes today, versus marking unenforced behaviour explicitly.

**Chosen:** explicit enforcement flags. A bucket C case that "passes" only because the model happened to decline is not evidence of a guardrail. Accuracy is computed over enforced cases only, and totals report both, so the harness cannot flatter the build.

### Phase 3 - Product Specs

- **UI:** None. `npm run eval [-- --sample N]` and `npm run eval:calibrate`.
- **Entities:** `GoldenCase`, `CaseOutcome`, `BucketScore`, `Report`, `FaithfulnessResult`.
- **Artifacts:** `eval/golden/golden-set.json`, committed run outputs under `eval/results/`.

### Phase 4 - Tech Specs

- **Judge:** sentence-level entailment against cited chunks, via the existing Azure provider. An unparseable judgement scores every sentence unsupported rather than defaulting to perfect.
- **Structural check:** deterministic regex over sentences, separate from the judge, per NFR-QUAL-02 being an independent gate.
- **CI:** `.github/workflows/ci.yml`. Typecheck and tests on push; calibration and eval on pull requests, with results uploaded as an artifact.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 5a | Scoring | Bands, structural check, per-bucket accuracy, build-failure rules |
| 5b | Judge and fixtures | Unfaithful fixture scores below 0.5 |
| 5c | Golden set | 50 cases, all ten C triggers, injection case |
| 5d | Runner | Four metrics, committed results, `--sample N` |
| 5e | CI gate | Non-zero exit on threshold breach |

### Phase 6 - Writing Code

- **Files touched:** `eval/harness/{score,run,calibrate}.ts`, `eval/judges/faithfulness.ts`, `eval/golden/golden-set.json`, `tests/fixtures/answers/judge-fixtures.json`, `tests/unit/eval-{score,fixtures}.test.ts`, `.github/workflows/ci.yml`, `src/rag/prompt.ts`.
- **Tests added:** 25.

**Measured, 2026-09-08, snapshot `2026-09-08T0313Z`:**

| Metric | Value | Threshold |
| --- | --- | --- |
| Faithfulness | 0.803 | 0.90, fails |
| Structural compliance | 76%, twelve uncited claims | 100%, fails |
| Refusal rate | 0.0% | under 20%, ok |
| Bucket A accuracy | 17/30 | - |
| Adversarial | 1/1 | - |
| Judge calibration | 14 judgements, 0 disagreements | at least 10 |

**Defects the run surfaced:**

1. **Stage 4's chunk ids silently broke citation parsing.** The new ids carry the document kind, which contains underscores, and the citation regex allowed only letters, digits and hyphens. Every citation parsed as none, so correct cited answers were logged as refusals across an entire stage. Fixed, with a test pinning a real id.
2. **The dominant quality gap is per-claim citation**, not retrieval. The model cites its first sentence and leaves later factual sentences uncited, which is exactly what FR-32 makes structurally impossible.
3. **Refusal is not representable today.** It is inferred from the absence of citations, which cannot distinguish a cited "not found" from a factual answer. Cases A-31 and A-32 were reclassified as not-yet-enforced rather than being scored against a heuristic that cannot express the behaviour.
4. **The synthetic provider directory is not cited as fact.** Asked about a named doctor, the assistant states the directory is demo data and routes to a human, closing the rule 6 risk raised when synthetic data was approved.


---

## Feature: Reranking, confidence floor, cite-or-refuse (Stage 6)

| Field            | Value                |
| ---------------- | -------------------- |
| Shipped          | 2026-09-08           |
| Cycle            | 5                    |
| Stage of plan.md | `plan-p1.md` Stage 6 |
| Owner            | user + claude        |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | The reranker score collapses on conversational phrasing, breaking D-016's premise | Make FR-32's structured payload the gate; keep the reranker for ordering |
| 2 | Which model, given accuracy@1 is tied and latency differs 2x | `ms-marco-MiniLM-L-6-v2` |

### Phase 2 - Architecting

**Options considered:**

1. **Keep D-016**, floor at the measured optimum. The gate is nearly inert.
2. **Normalise the question** into a terse search query before reranking. Restores the score, costs a pre-generation model call inside an 800ms budget.
3. **Structured payload as the contract**, reranker demoted to a coarse relevance gate.

**Chosen:** 3, logged as D-038. Stage 5 measured the real failure mode and it was uncited claims, not retrieval. A scalar cannot fix that; a schema that makes an uncited claim unrepresentable can.

### Phase 3 - Product Specs

- **UI:** None yet. `npm run ask -- "<question>" --plan <004|007>`.
- **Entities:** `RerankedChunk`, `TurnResult`, `AnswerPayload` (claims, unanswered, refusal), `CitableChunk`.
- **Answer flow:** retrieve hybrid, rerank, gate, prompt for JSON, validate, check citation containment, render prose in the application.

### Phase 4 - Tech Specs

- **Reranker:** `@huggingface/transformers@4.2.0`, `Xenova/ms-marco-MiniLM-L-6-v2` quantised. *Rejected:* `onnxruntime-node` plus a hand-written tokenizer, two dependencies for the same result; L-12-v2, twice the latency for tied accuracy@1.
- **Validation:** hand-rolled at the model boundary, per the Zod deferral.
- **Streaming:** server-sent events parsed from the Azure response body. FR-08.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 6a | Reranker and spike | Two candidates measured, choice justified by numbers |
| 6b | Floor calibration | Floor derived from separation, not chosen |
| 6c | Payload validation | Uncited claim unrepresentable |
| 6d | Answer pipeline | One path shared by CLI and eval |
| 6e | Named edges | Datastore down, below floor, partial, conflict, provenance, streaming |

### Phase 6 - Writing Code

**Measured, 2026-09-08:**

| Metric | Stage 5 | Stage 6 | Threshold |
| --- | --- | --- | --- |
| Faithfulness | 0.803 | **0.988** | 0.90, passes |
| Structural compliance | 76% | **100%** | 100%, passes |
| Refusal rate | 0.0% | 13.3% | under 20%, ok |
| Bucket A accuracy | 17/30 | **25/28** | - |

All six named edges pass, including the datastore-unreachable case the plan calls the most important in the stage.

**Defects the run surfaced:**

1. **The reranker score is not a usable confidence signal.** Identical questions score 0.998 terse and 0.0005 conversational, while out-of-corpus questions reach 0.0002. Amended in D-038.
2. **Automated conflict detection fabricated a conflict.** It compared amounts from unrelated benefits, then the model declared a correct Clover document incorrect and invented a $25 copay. Removed in D-039.
3. **The Evidence of Coverage table of contents was parsed as headings**, because body chapters carry their title on the next line. EOC chunks fell 656 to 318.

**Known NFR breach:** time to first token 1632ms against NFR-PERF-02's 800ms, unthrottled. The structured payload worsens it, because JSON must be emitted before any useful token.


---

## Feature: Chat surface and accessibility (Stage 7)

| Field            | Value                |
| ---------------- | -------------------- |
| Shipped          | 2026-09-08           |
| Cycle            | 6                    |
| Stage of plan.md | `plan-p1.md` Stage 7 |
| Owner            | user + claude        |

### Phase 1 - Requirements

Driven by the six conflicts `design/mock/README.md` lists between the mock and frozen requirements.

| # | Conflict or question | Resolution |
| --- | --- | --- |
| 1 | Mock type scale runs 10-14px against an 18px floor | Lift the whole scale; later narrowed by D-042 to the reading surface only |
| 2 | Corpus reproduces Clover's real phone number under citation | Accept, since it is quoted from a public document |
| 3 | Support hours are unsourced | Show as clearly-labelled placeholder |
| 4 | Frontend stack undecided | React with TypeScript and Vite |
| 5 | axe, Playwright, Lighthouse needed by five criteria | Approved but deferred to P3 |
| 6 | Time to first token 1632ms against an 800ms budget | Amend the budget to the measured number |

Applied without asking, per the mock README: attach button removed (P4, auth-gated), sidebar search and Recent list omitted (P2), plan names corrected to the real `Clover Health Choice (PPO)` 004 and `Clover Health Choice Value (PPO)` 007, header contract corrected from the non-existent `H5141-001`.

### Phase 2 - Architecting

**Options considered:**

1. **Vanilla TypeScript with Vite** - fewest dependencies, most hand-written state and accessibility work.
2. **React with Vite and a thin Node API** - a component model for streaming, plan context and refusal states; adds React.
3. **Next.js** - routing, API routes and deploy in one; the largest dependency in the project.

**Chosen:** 2. The panel carries real state and Next.js brings a framework's surface for a single route.

### Phase 3 - Product Specs

- **UI:** host page with nav, hero, plan cards and support block; launcher fixed bottom right; panel at 40vw, full width under 48rem; `/assistant` full-page route sharing one `Assistant` component.
- **UX flow:** ask freely, plan chips appear only when the question is plan-scoped, answer renders claim by claim with a citation block, feedback control on answered turns only.
- **Frontend entities:** `Turn`, `Citation`, `Claim`, `PlanOption`, `AskEvent`.
- **Backend entities:** one streaming endpoint `POST /api/ask`, one `GET /api/plans`.

### Phase 4 - Tech Specs

- **Framework:** React 19 with Vite 8. *Rejected:* vanilla, for state complexity; Next.js, for surface area.
- **Transport:** server-sent events over a plain Node HTTP server. *Rejected:* WebSockets, since the stream is one-directional and short-lived.
- **Styling:** hand-written CSS against DESIGN.md tokens, no hex values in component styles. *Rejected:* Tailwind, an unapproved dependency whose utility classes would have made the type-scale audit harder to enforce.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 7a | Tokens with the lifted scale | No text token below 18px |
| 7b | Plan-scope rule | Cost asks, process does not |
| 7c | Streaming API | Events for plan prompt, progress, answer, error |
| 7d | Surface | Launcher, panel, full-page route, starters, citations, feedback |
| 7e | Static audit | Type, target, focus, hover and required surfaces asserted |

### Phase 6 - Writing Code

**Verified:**

- Lazy plan context both sides of the boundary, live: "how do I file an appeal" answers without asking; "what is my specialist copay" returns plan chips first, then $10 for plan 004.
- 22 static accessibility assertions pass: no font size below 18px, 44px target minimum applied to buttons, inputs and starters, a 3px focus ring never removed, no hover rule that reveals content, reduced motion honoured, and the FR-13, FR-14, FR-15, FR-30 and NFR-SEC-01 surfaces present.
- The real Clover phone number appears nowhere in the interface, asserted by test.
- 236 tests pass; the 10 red are Stage 8 stubs.

**Not verified, and not claimed** (D-040): automated axe scan, keyboard-only walk, computed focus and target sizes, reflow at 200% zoom, throttled Lighthouse, and the screen-reader pass. Five of eleven acceptance criteria and the manual one.

**Defect found:** `src/rag/payload.ts` shipped Clover's real support number in every refusal, violating D-026. Fixed, with a regression test.

