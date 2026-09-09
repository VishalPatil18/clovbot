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


---

## Feature: Guardrails and escalation (Stage 8)

| Field            | Value                |
| ---------------- | -------------------- |
| Shipped          | 2026-09-08           |
| Cycle            | 7                    |
| Stage of plan.md | `plan-p1.md` Stage 8 |
| Owner            | user + claude        |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | How are the ten bucket C triggers detected | Rules, not a classifier |
| 2 | Where does the guardrail run | Before retrieval |
| 3 | Ambiguous phrasing: refuse or answer | Refuse |
| 4 | Rate limit storage | Postgres |
| 5 | Callback storage | New table |
| 6 | C-06 gives directive emergency guidance | Confirmed intended |

### Phase 2 - Architecting

**Options considered:** rules per trigger · a model classifier · a hybrid.

**Chosen:** rules, logged as D-043. Stage 5 measured bucket C scoring near zero on the reranker and Stage 6 measured the model's own refusal branch firing inconsistently, so neither signal can carry a regulatory boundary. A guardrail that is non-deterministic is not a guardrail.

### Phase 3 - Product Specs

- **UI:** refusal surface showing what was searched, a pre-filled callback panel, a rate-limit notice, all with the phone number visible.
- **Entities:** `GuardrailHit`, `CallbackRequest`, `RateVerdict`, `LoopState`.
- **DB schema:** `callbacks` (question, plan_context, documents_searched, refusal_trigger, note, session_id); `rate_events` plus a `rate_check` function; `turns` gains `session_id` and `refusal_trigger`, which FR-26's record specified and Stage 3 omitted.

### Phase 4 - Tech Specs

- **Detection:** ordered regular expressions with per-rule exception patterns. *Rejected:* a model call, for determinism and latency.
- **Session identity:** server-issued opaque UUID in an HttpOnly cookie. Carries no member identity.
- **Rate limiting:** counted in Postgres so it survives a restart and is auditable. *Rejected:* in-memory, which resets silently.
- **Loop breaker state:** read from the turn log rather than server memory, for the same reason.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 8a | Ten trigger rules | Each refuses; the A-11 pair splits |
| 8b | Loop breaker and language | The two remaining stubs pass |
| 8c | Migration | Callbacks, rate events, session columns |
| 8d | Server wiring | Guardrail before retrieval, limits, callback endpoint |
| 8e | Escalation surface | Pre-filled form, limit notice |
| 8f | Enforce buckets B and C | Whole golden set enforced, eval re-run |

### Phase 6 - Writing Code

**Measured, 2026-09-08:**

| Metric | Stage 6 | Stage 8 |
| --- | --- | --- |
| Cases enforced | 29 of 50 | **50 of 50** |
| Faithfulness | 0.988 | **1.000** |
| Structural compliance | 100% | 100% |
| Refusal rate | 13.3% | 13.3% |
| Bucket A | 25/28 | **27/30** |
| Bucket B | not enforced | **8/8** |
| Bucket C | not enforced | **10/10** |

Every Stage 8 acceptance criterion passes against the live database, verified by `scripts/stage8-checks.ts`: ten triggers refuse, the A-11 and C-01 pair splits, a clinical question yields no hedged advice, plan selection refuses without comparing, an injected instruction does not change citation behaviour, the loop breaker arms at two and resets on an answer, the callback stores its pre-fill, the rate limit cuts off with a readable message, Spanish refuses in English, and a dead datastore logs `upstream_failure` with no factual claim.

**Defects the run surfaced, both fixed:**

1. **"If I end up in the emergency room what am I looking at paying" fired C-06**, because the bare word "emergency" is also a benefit name. The rule now needs an acute symptom or the member saying they are in one.
2. **"How long do I have to file an appeal" fired C-05**, because the exception covered "how do I" but not "how long". Bucket A fell to 25/30 until both were fixed.

**All 66 stubs written in session one are now implemented. The suite is 307 green, zero failing.**


---

## Feature: Voice integration (Stage 9)

| Field            | Value                |
| ---------------- | -------------------- |
| Shipped          | 2026-09-08           |
| Cycle            | 8                    |
| Stage of plan.md | `plan-p1.md` Stage 9 |
| Owner            | user + claude        |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | Run the skipped Stage 2 spike first | No, build it |
| 2 | ElevenLabs account | Exists |
| 3 | Fish Audio, whose free tier closed | Account has credits; keep D-009's chain |
| 4 | Speech to text provider | ElevenLabs and Fish Audio, same chain |
| 5 | Where synthesis runs | Server-side |
| 6 | Audio cache | Disk under `data/` |
| 7 | The two unmeasured budgets | Measure on the real system, then record the values |

Raised during the build and answered: **live partial transcription**. Both providers transcribe in batch, and the streaming alternative would have sent a member's spoken health question to Google. Resolved as D-045.

### Phase 2 - Architecting

**Options considered:** Scribe v2 Realtime over WebSocket · browser `SpeechRecognition` for partials · no partials, with listening and processing states.

**Chosen:** no partials. The protective half of FR-18 is the editable transcript; the live partial is reassurance, and buying reassurance by routing health questions to a third party is the wrong trade.

### Phase 3 - Product Specs

- **UI:** persisted mode toggle; a 112px microphone with idle, listening and processing states; a level meter standing in for the partial transcript; an editable transcript before sending; play and stop controls on the answer.
- **Entities:** `Attempt`, `ChainResult`, `Recording`, `Transcription`, `Spoken`.
- **Storage:** MP3 on disk under `data/audio/`, keyed on a hash of provider, voice and text.

### Phase 4 - Tech Specs

- **Providers:** ElevenLabs `/v1/text-to-speech/{voice_id}` and `/v1/speech-to-text`; Fish Audio `/v1/tts` and `/v1/asr`. **Both shapes read from the live OpenAPI documents on 2026-09-08 rather than recalled.**
- **Chain:** one generic fall-through shared by speech-to-text and text-to-speech, so both have one rule and one set of tests.
- **Capture:** `MediaRecorder` plus an `AnalyserNode` for the level meter. *Rejected:* the browser's `SpeechRecognition`, per D-045.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 9a | Chain and cache | Fall-through, degrade notice, stable key |
| 9b | Providers | Verified against live specs |
| 9c | Endpoints | Synthesis server-side, keys off the page |
| 9d | Voice surface | Hold and tap, editable transcript, playback |
| 9e | Measure | The two budgets, from the real system |

### Phase 6 - Writing Code

**Verified live:**

- A full question and answer by voice, spoken and written together, with citations.
- Breaking the ElevenLabs key falls through to Fish Audio and tells the member: *"The usual voice was unavailable, so this is being read by a different voice."*
- Breaking both remote providers reaches the browser synthesiser, the tier that cannot be exhausted. This is the case that proves the chain terminates somewhere safe.
- Cache: 6433ms to synthesise, **0.9ms** on repeat.

**Measured latency, the first voice numbers this project has had:**

| | Median | Target | |
| --- | --- | --- | --- |
| Answer ready | 2839ms | - | |
| First audio | 4007ms | 1500ms | missed |
| Complete spoken answer | 17-31s | 4000ms | **impossible** |

Both budgets amended by D-046. The second was not missed but unachievable: speech runs at roughly 18 characters per second, so a typical answer takes 17 to 31 seconds to say. The requirement had conflated beginning to speak with finishing.

**Defects found:**

1. **The cache looked up only the primary provider.** After a fall-through it wrote under `fishaudio` and read `elevenlabs`, a permanent miss that also mislabelled the provider. Now checks the chain in order.
2. **A TypeScript parameter property crashed the server on boot** while 343 tests passed, because Vitest transpiles and Node's strip-only loader does not. Nothing in the suite covers "does the process start".


---

## Feature: Deploy and release verification (Stage 10)

| Field            | Value                 |
| ---------------- | --------------------- |
| Shipped          | 2026-09-08            |
| Cycle            | 9                     |
| Stage of plan.md | `plan-p1.md` Stage 10 |
| Owner            | user + claude         |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | Where the API runs, given Vercel cannot host it | Google Cloud, with credits available; one-command deploy plus CI |
| 3 | Whether a secret scan is needed at all | Kept, but as a test rather than a new tool |
| 4 | Instrumentation as a route or a command | Command line |
| 5 | DNS for `clovbot.v-ai.org` | name.com, user owns it |
| 6 | Real-device latency pass | User runs it from a template |

Two defects found while scoping, not asked about: **FR-27 feedback recorded nothing** since Stage 7, and **`reproduceTurn` had been deleted** at Stage 4 while NFR-OPS-02 still depends on it.

### Phase 2 - Architecting

**Options considered:**

1. **A container on Cloud Run**, Vercel proxying `/api`. No refactor; the reranker model loads once per instance.
2. **Vercel functions.** Would need the snapshot id moved off disk, the audio cache moved to object storage, and a 2453ms model load accepted on every cold start.
3. **Backend local only.** Fails the first acceptance criterion, since the deployed URL could not answer.

**Chosen:** 1. The proxy is not cosmetic: the session cookie is `HttpOnly; SameSite=Lax`, so a cross-origin API would drop it and take rate limiting and the loop breaker with it.

### Phase 3 - Product Specs

- **UI:** unchanged, plus the feedback control now posting its answer.
- **Operator surface:** `npm run insights` and `npm run reproduce -- <turn-id>`, both command line.
- **DB schema:** `turns` gains `member_feedback` (`resolved` | `not_resolved`), plus indexes on outcome and refusal trigger.

### Phase 4 - Tech Specs

- **Container:** `node:26-slim`, source only. *Rejected:* baking the corpus, since chunks come from Postgres and only the snapshot id is needed at query time.
- **Deployment:** Cloud Run via `gcloud run deploy --source .`, so Cloud Build builds remotely and no local Docker is required. *Rejected:* Vercel functions, per Phase 2.
- **Secret scan:** a test over git-tracked files. *Rejected:* `gitleaks`, which would add a tool for something the existing gate already runs.
- **Instrumentation:** command line. *Rejected:* a route, which would publish the member question log.

### Phase 5 - Planning

| Sub-stage | Goal | Acceptance |
| --- | --- | --- |
| 10a | Make the runtime host-agnostic | Snapshot id and audio path configurable |
| 10b | FR-27 | The response is stored against its turn |
| 10c | NFR-OPS-02 | A turn id rebuilds its exact retrieved context |
| 10d | Instrumentation | Containment, refusal reasons, unanswered questions |
| 10e | Secret scan | A planted key fails the build |
| 10f | Deploy | One command, plus CI, plus written steps |

### Phase 6 - Writing Code

- **375 tests pass**, 12 of them the secret scan. The scan was verified by planting an ElevenLabs-shaped key and confirming it failed with the file named.
- The container's runtime imports are `pg` and `@huggingface/transformers`, both production dependencies, so `npm ci --omit=dev` produces a working image.

**Left for the user, with steps in `README.md`:** apply `migrations/004_release.sql`, run the Google Cloud setup, `npm run deploy:api`, put the Cloud Run URL in `vercel.json`, add the CNAME at name.com, and fill `eval/results/real-device-latency.md` from a phone.

**Not verified, and not claimed:** the deployed URL answering, the throttled latency numbers, and the accessibility criteria D-040 deferred. All three need the deploy and a real device.


---

## Feature: Second contract indexed (P2 Stage 1)

| Field            | Value                |
| ---------------- | -------------------- |
| Shipped          | 2026-09-08           |
| Cycle            | 10                   |
| Stage of plan.md | `plan-p2.md` Stage 1 |
| Owner            | user + claude        |
| Requirements     | `srs-p2.md` FR-P2-01 to FR-P2-06 |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | Which second benefit package | H8010-002 Classic (HMO), same county. Distinct contract, distinct network type (D-048) |
| 2 | How far the plan-identity change goes | A typed contract-and-plan pair throughout (D-049) |
| 3 | How contract-wide documents are scoped | A contract wildcard mirroring the existing plan wildcard (D-056) |
| 4 | Golden set schema | `plan: "004"` becomes a `planRef` object on all 50 cases |
| 5 | Where the offerable plan list comes from | Derived from what is indexed (D-055) |
| 6 | Which H8010 documents are indexed | All three - SB, EOC, ANOC - full parity with H5141 |
| 7 | The paired golden questions | Four numeric pairs plus one structural pair |
| 8 | Regression fixture size | Trimmed two-page, pages 10 and 11 |
| 9 | Synthetic provider directory for the new plan | Yes, same generator |
| 10 | Whether to verify the HMO layout before speccing | Yes, fetched to scratch first |

**Verified during requirements, not assumed:**

- H8010-002 carries EOC and ANOC under the same catalog keys as H5141. Its Summary of Benefits is `..._nj_002-003_...`, the same two-plan side-by-side shape, titled "New Jersey 2026 Summary of Benefits Plans 002 and 003".
- The extractor **fails** on it. Root cause measured and recorded in D-057.
- Paired-question material, read from both documents: out-of-pocket maximum $6,000 against $9,250, emergency care $130 against $115, urgently needed $25 against $35. Specialist ($10) and primary care ($0) **collide** between H8010-002 and H5141-004 and prove nothing. The HMO has no out-of-network column at all, so the fifth pair differs in shape rather than in digits.

**Defects found while scoping, not asked about:**

- `search_hybrid` filters `c.contract_id = p_contract_id` while corporate pages and the formulary are stamped with the single `CONTRACT_ID`. A session scoped to H8010 loses all six corporate pages and the whole formulary.
- `src/server.ts` composes the turn log's `planContext` from a module constant, so a turn answered under a second contract would be logged under the first.
- `/api/ask` never checks that a `planId` is indexed. An unknown plan returns zero rows and reads as a model refusal.
- `connect()` builds a `pg.Client` but never dials, so the boot check throws only on a missing `DATABASE_URL` or unreadable CA. The comment claiming a broken environment fails to start is wrong.
- `CORPUS_COUNTY_ID` is forwarded to Cloud Run by `scripts/deploy-api.sh` and read by no code.
- The 004/007 Summary of Benefits is fetched twice; the dedupe is keyed on document id, which differs per plan.
- `CallbackPanel.tsx` shows a member the raw string "H5141-004" under a heading reading "Plan".

### Phase 2 - Architecting

Four forks, each taken to the user with options. Full reasoning in D-053 through D-057.

1. **Corpus scope shape.** Chosen: one typed `src/corpus/scope.ts` imported by all four current sources of truth. *Rejected:* a JSON descriptor, which adds a hand-rolled validator and a second untypechecked source; CLI flags, where a `fetch` run disagreeing with its `discover` run is undetectable.
2. **PlanRef blast radius.** Chosen: `PlanRef` types the scope; rows keep flat fields; `planContext` stays text written by one formatter. *Rejected:* structured turn-log columns, which leave every existing row null or require the string-splitting D-049 forbids; nesting the pair into all 59 call sites, which collides with Stage 3's citation work.
3. **Plan list derivation.** Chosen: the set from `chunks` at boot, display names from a typed code map. *Rejected:* the catalog snapshot, falsified - `data/` is gitignored and absent from the image; a `plan_name` column, which encodes the invariant only by accident; a `plans` table, which is right if names ever vary per deployment.
4. **The column-gutter fix.** Chosen: inherit plan identity and header positions only, compute both gutters on the page being rendered, and search backward only. *Rejected:* histogram detection, which introduces silent truncation on prose pages; requiring headers everywhere, which converts neither document.

### Phase 3 - Product Specs

**UX flow, changed lines only:**

1. Member asks a plan-scoped question with no plan set. Chips appear, now three, grouped by contract.
2. Member picks one. The answer is scoped to that contract and plan.
3. The chosen plan persists as chrome with a change control. Picking a different one re-scopes later answers and leaves earlier ones as they were.
4. A process question still answers with no chips, unchanged from D-022.

**Frontend entities:** `PlanOption` gains `contractId`; the chip list groups by contract and renders the display name, never a raw id. The same name map feeds `CallbackPanel`.

**Backend entities:** `PlanRef { contractId, planId, planYear }` in `src/types.ts`. `PLANS` is replaced by a boot-time query over `chunks` joined to a typed name map. `/api/plans` returns display names with refs; `/api/ask` takes a ref and validates membership, returning 400 on an unknown one.

**DB schema:** no new tables and no new columns. `search_hybrid` is replaced in place so its contract predicate accepts the wildcard. Parameters and return columns are unchanged.

**Corpus:** `src/corpus/scope.ts` holds county, state, year and a plan-reference list. Contract-wide documents carry an empty contract, mapped to the wildcard at ingest from the one `CONTRACT_WIDE` list.

### Phase 4 - Tech Specs

- **Language and runtime:** unchanged. TypeScript strict, Node 26, native type stripping.
- **Scope descriptor:** a typed module. *Rejected:* JSON plus validator, per Phase 2; this project has no `zod`, so every parsed file costs a hand-rolled validator.
- **Migration:** one file, `create or replace function search_hybrid`. *Rejected:* `drop`/`create`, unnecessary since the signature does not change; adding an index on `(contract_id, plan_year, plan_id)`, unjustified at three plans and a few thousand rows.
- **Plan name source:** a typed key-to-label map, matching the existing `KIND_LABEL` pattern. *Rejected:* a `plans` table, deferred until names need to vary per deployment.
- **Fixture:** a trimmed two-page bbox XHTML, following the existing `sob-page1` and `sob-page4` precedent. *Rejected:* the full 12-page document at 458KB, five times the weight for one bug.
- **New dependencies:** none.

**Known cost, stated rather than discovered later:** `contextPrefix` embeds `contractId-planId` in the stored body, so moving corporate and formulary chunks to the contract wildcard makes `existingChunkContent` see roughly 500 chunks as changed. They re-embed once.

### Phase 5 - Planning

Eight sub-stages, 22.5h against Stage 1's M band of ~7h. The overrun is entirely decisions taken after that estimate: D-049, D-053, D-056, D-057. Every sub-stage is a commit point with the suite green.

| # | Sub-stage | Deliverable | Effort |
| --- | --- | --- | --- |
| 1.1 | Scope module and PlanRef | One typed scope, four env vars gone, golden set on `planRef` | 3h |
| 1.2 | Contract wildcard | Corporate and formulary reachable from any contract | 2.5h |
| 1.3 | Fetch H8010-002 | Second contract on disk, SB conversion failing for the predicted reason | 2h |
| 1.4 | Column-gutter bug cycle | H8010 SB converts; all four plan columns extract | 3h |
| 1.5 | Ingest and leakage check | H8010 answerable at the CLI, leakage asserted | 3h |
| 1.6 | Derived plan list and validation | `/api/plans` from the index, `/api/ask` 400 on an unknown ref | 3h |
| 1.7 | Web plan chrome | Three chips grouped by contract, names not raw ids | 3h |
| 1.8 | Paired golden cases | Five cross-plan pairs, full eval green | 3h |

**Ordering correction, found while implementing 1.1.** Contract-wide documents (corporate pages, the formulary, the pharmacy directory) are stamped with a single contract id, which no longer exists once scope is a plan list. 1.1 replaces it with `soleContractId()`, which throws when the corpus spans more than one contract. That is a guard, not a landmine - it fails at boot with a readable message - but it means **the server and ingest must be migrated off a single contract before 1.3 adds H8010 to the scope.** The wildcard work in 1.2 does exactly that for ingest; the server's ref threading moves from 1.6 into 1.2 for the same reason. Only the boot-time database derivation stays in 1.6, since it needs an index holding two contracts.

**Operator actions between sub-stages:** apply `migrations/005_contract_wildcard.sql` after 1.2; run the corpus commands after 1.3 and again after 1.4; run `npm run ingest` and the leakage check after 1.5.

**Cost found by the planner, not by the brief.** `existingChunkContent` and `readGeneratedContext` are both keyed by snapshot id. A new corpus snapshot therefore re-embeds the entire index rather than the ~500 wildcard chunks, and regenerates every orphan context prefix from a non-deterministic model - which moves the answers the golden set is pinned to. `context-prefixes.json` is copied forward in 1.3. That copy is safe only because the H5141 documents are unchanged; a changed document would keep a stale prefix.

**Coverage gaps, decided rather than discovered:**

- Cross-plan leakage is asserted by `scripts/plan-scope-check.ts` against a live index, plus a pure unit test of the scope predicate in CI. The live half is not in `npm test`, which is the residual.
- FR-P2-05, plan switching not altering prior answers, is verified by hand. No browser or component harness exists and adding one is a dependency decision deferred.
- `srs-p2.md` amended to 1.0.1 so FR-P2-02 and FR-P2-03 match D-054 and D-056 rather than contradicting them.

### Phase 6 - Writing Code

**1.1 Scope module and PlanRef.** `src/corpus/scope.ts` became the only declaration of what the corpus covers, replacing module constants in `src/corpus/cli.ts` and three `CORPUS_*` environment variables read independently by `src/rag/cli.ts`, `src/server.ts` and `eval/harness/run.ts`. The dead `CORPUS_COUNTY_ID` went with them. `PlanRef` landed in `src/types.ts`; `Snapshot` moved from a contract plus a `"004+007"` string to a plan list. All 50 golden cases moved to `planRef` objects, guarded by a test that refuses any case referencing a plan the scope does not declare.

**1.2 Contract wildcard.** Contract-wide documents carry `contractId: "*"` alongside the existing plan wildcard, mapped from the one `CONTRACT_WIDE` list and keyed on document kind rather than on what discover stamped. `migrations/005_contract_wildcard.sql` replaces `search_hybrid`; everything below the `scoped` CTE is byte-identical to 002, verified by diff. `citationLabel` was one branch away from printing **"Plan \*"** to a member and now names the document instead.

The server migration was pulled forward from 1.6, because 1.1's `soleContractId()` guard throws once a second contract enters scope and the server would have been broken between 1.3 and 1.6. `planContext` is now written from the reference that answered the turn rather than from a module constant, and an unindexed plan returns 400 instead of retrieving nothing and reading as a refusal.

**1.3 Fetch.** 17 documents discovered, 17 fetched. `context-prefixes.json` was copied forward before ingest, without which 36 generated prefixes would have been regenerated from a non-deterministic model and moved the answers the golden set is pinned to. The H8010 Summary of Benefits failed conversion with exactly the error D-057 predicted.

**1.4 The column-gutter bug cycle.** Fixed as designed: `PlanHeaders` carries plan identity and header positions and is inherited; `columnsFor` computes both gutters on the page being rendered. `nearestHeaders` searches backward only. All 20 pre-existing column assertions still pass, including the H5141 page-15 inheritance case and the full-width prose that must not be cut.

**Found while fixing it:** `convertAll` passes through any entry whose status is not `ok`, so a document that failed conversion is never retried and a fixed converter needs a full re-fetch to prove itself. Named, not fixed - it is outside this cycle's diff.

**1.6 Derived plan list.** `PLANS` is populated at boot from `select distinct contract_id, plan_id, plan_year from chunks`, with display names from a typed map that raises rather than letting a contract number reach a member. `boot()` now actually connects and queries: `connect()` only constructs a `pg.Client`, so the previous boot check threw on a missing `DATABASE_URL` or unreadable CA and nothing else. A wrong password or an unindexed database used to start cleanly and 503 every question.

**1.7 Web plan chrome.** `PlanOption` carries its contract, `ask()` sends both halves, and chips key on the pair. The chosen plan persists in the header with a Change plan control that re-opens the picker; answers already in the transcript keep the plan they were answered under. `CallbackPanel` showed a member the raw string "H5141-004" under a heading reading "Plan" and now shows the plan name, with the id kept on the stored record for operators.

**`web/` had never been typechecked.** The root `tsconfig.json` include listed `src`, `tests`, `eval` and `scripts`, and Vite strips types without checking them. `web/tsconfig.json` now extends the root with `dom` and `jsx`, and `npm run typecheck` runs both projects, so CI gates the browser code for the first time. Three errors surfaced, all CSS side-effect imports.

**1.8 Paired golden cases.** Ten cases as five pairs, each the same question under two plan references with different expected answers. Four numeric, one structural. Guarded by tests asserting at least five paired questions exist, that no pair expects the same answer from both halves, and that at least one pair crosses contracts.

Specialist and primary-care copays **collide** between H8010-002 and H5141-004 at $10 and $0, so the specialist pair uses H5141-007 instead. Had the pairs been written from the plan document rather than from the converted corpus, two of the five would have proved nothing while appearing to pass.

**Verified against the live index, not asserted:**

- **1,801 chunks** indexed across three plans and two contracts, up from 1,476. The whole index re-embedded because both `existingChunkContent` and `readGeneratedContext` key on snapshot id.
- **The exit signal.** "What is my out of pocket maximum" returns **$6,000** under H8010-002 and **$9,250** under H5141-004, each cited to its own plan's documents.
- **The contract wildcard end to end.** "What tier is atorvastatin on" answers under H8010-002 citing `Drug List 2026 · ANTILIPEMICS, FIBRATES`, with no wildcard rendered.
- **Leakage.** `scripts/plan-scope-check.ts` checked 300 rows across 3 plans and 10 questions: **0 leaks**. Inverting its predicate by hand reported 300, so the check is capable of failing rather than vacuously green.

**Eval, 60 cases, all enforced:**

| Metric | v1.0.0 | This stage |
| --- | --- | --- |
| Faithfulness | 1.000 | **1.000** |
| Structural compliance | 100% | **100%** |
| Refusal rate | 13.3% | **10.0%** |
| Bucket A | 27/30 (90.0%) | **37/40 (92.5%)** |
| Bucket B | 8/8 | **8/8** |
| Bucket C | 10/10 | **10/10** |
| Adversarial | 1/2 | **1/2** |

The failing set is **identical before and after** - A-03, A-18, A-28, ADV-01 - so nothing regressed and nothing new broke. All ten paired cases pass. Written to `eval/results/2026-09-08T1755Z.json`.

**Still not verified, and not claimed:** FR-P2-05, that switching plans mid-session leaves earlier answers untouched, is verified by reading the code rather than by running the browser. There is no component harness, and adding one is a dependency decision the user deferred. The leakage check needs a live index and does not run in CI; the pure predicate behind it does.

---

## Feature: Structured formulary lookup and the router (P2 Stage 2)

| Field            | Value                            |
| ---------------- | -------------------------------- |
| Shipped          | 2026-09-08                       |
| Cycle            | 11                               |
| Stage of plan.md | `plan-p2.md` Stage 2             |
| Owner            | user + claude                    |
| Requirements     | `srs-p2.md` FR-P2-07 to FR-P2-12 |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | How the formulary is parsed | Bounding boxes, reusing the Summary of Benefits machinery (D-058) |
| 2 | Where typed rows live | A `drugs` table populated at ingest (D-060) |
| 3 | What decides the route | A drug name present in the typed table (D-061) |
| 4 | How a both-halves question is handled | Paths are additive, not exclusive (D-062) |
| 5 | Where the router's decision is recorded | Two columns on `turns` (D-063) |
| 6 | Where the routing cases live | Their own file, run inside `npm run eval` (D-063) |
| 7 | How a member's word matches a table row | Normalized name tokens, longest match wins |
| 8 | What to do about the chunker heading bug | Fix inside this stage as a nested bug cycle (D-059) |

**Measured before speccing, not assumed.** The SRS listed formulary parseability as an open question; it is now closed. The document holds **2,468 drug rows across 105 categories** on 85 of its 123 pages. Layout text captures every row but drops **564 strength continuations and 379 requirement continuations**, and one line carries both halves at once, so a drug would read as carrying a quantity limit when it also requires step therapy. Bounding boxes place the columns at Tier x=375 and Requirements x=410 on every table page, which makes a continuation's column a fact.

**Defect found while probing, live in v1.0.0.** `FORMULARY_CLASS` admits no lowercase letter and no parentheses, so `ANTILIPEMICS, HMG-CoA REDUCTASE INHIBITORS` and `DISEASE-MODIFYING ANTI-RHEUMATIC DRUGS (DMARDS)` never match. Ten statins are indexed and cited under the preceding class. Visible in `eval/results/2026-09-08T0947Z.json`, where atorvastatin cites `...antilipemics-fibrates-001`.

### Phase 2 - Architecting

Four forks, each taken to the user. Full reasoning in D-058 through D-063.

1. **Parse path.** Bounding boxes. *Rejected:* per-page column detection from the repeated header, and indentation thresholds - both re-derive from whitespace what the PDF already carries, and D-057 had just shown that assumption failing in this filer's documents.
2. **Storage.** A `drugs` table at ingest. *Rejected:* a snapshot JSON artefact, which reads from a gitignored directory absent from the container; extra columns on `chunks`, which already carries wildcard scoping semantics.
3. **Router.** Deterministic, keyed on indexed drug names. *Rejected:* an LLM classifier, because a zero-tolerance gate cannot depend on a probabilistic component; rules-plus-model, which doubles the thing under test.
4. **Both halves.** Additive paths. *Rejected:* single selection with chaining, which introduces a "looks incomplete" judgement; always-both, which leaves no selection to measure.

### Phase 3 - Product Specs

**UX flow, changed lines only:**

1. A member names a drug. The typed row answers the tier, cited to the row.
2. A member asks a rules question. RAG answers, unchanged.
3. A member asks both in one sentence. Both answer, each claim carrying its own citation kind.
4. A drug the table does not hold falls through to RAG rather than failing.

**Backend entities:** `DrugRow { name, normalizedName, form, strengths, tier, requirements, category, snapshotId }`. `RouteDecision { paths, reason }`.

**DB schema:** a `drugs` table keyed on snapshot and normalized name; `turns` gains nullable `route` and `route_reason`.

**Citation shape:** a row cites as `Drug List <year> · <drug name>`. The category travels in the chunk's section for prompt context, but `shortSection` renders only the last segment, and the drug name is the right leaf anyway - the formulary's own index is alphabetical by drug, so the name is what a member looks up.

### Phase 4 - Tech Specs

- **Parser:** `pdftotext -bbox-layout`, reusing `parseBboxPages`. *Rejected:* a new PDF library, since poppler is already a prerequisite and the bbox reader already exists.
- **Matching:** normalized name tokens, longest match wins. *Rejected:* first-token exact match, which misses multi-word and combination drugs; `pg_trgm` fuzzy matching, which turns an exact gate into a threshold.
- **Storage:** Postgres, same connection and migration path as every prior stage.
- **New dependencies:** none.

### Phase 5 - Planning

Planned inline rather than by dispatching `spec-planner`: the four architectural forks were resolved before planning began, leaving sequencing with no open questions to explore.

| # | Sub-stage | Deliverable |
| --- | --- | --- |
| 2.1 | Formulary parser | 2,468 typed rows from a committed bbox fixture, continuations joined |
| 2.2 | Chunker heading fix | Both missed classes detected; regression test pins them by name |
| 2.3 | Drugs table and ingest | Rows persisted in the same `npm run ingest` run |
| 2.4 | Router and logging | Deterministic selection, recorded on every turn |
| 2.5 | Structured answer path | Tier answers cited to a row, additive with RAG |
| 2.6 | Routing set and eval | 30 hand-labelled cases, confusion matrix in the eval report |
| 2.7 | Re-ingest and verify | Full eval, no P1 or Stage 1 regression |

### Phase 6 - Writing Code

**2.1 Formulary parser.** `src/corpus/formulary.ts` reads typed rows from bounding boxes, taking column boundaries from each page's own `Drug Name / Drug Tier / Requirements/Limits` header rather than inheriting them - the D-057 rule, applied to a second parser. 2,468 rows across 105 categories from the real document, none uncategorized.

**2.2 Chunker heading fix.** `FORMULARY_CLASS` now admits lowercase and parentheses. Widening it alone broke the existing tests, because the old pattern had been excluding drug rows **by accident** - a row contains "15mg", whose lowercase disqualified it. The accident was doing real work. The discriminator is now explicit and matches the typed parser's own rule: a drug row carries a tier digit in its own column and a class heading never does.

**2.3 Drugs table.** `migrations/006_drugs_and_routing.sql` adds `drugs` and two columns to `turns`. Populated inside the existing `npm run ingest` run.

**2.4 Router.** `src/rag/router.ts` selects paths from the drug names actually indexed. A member types "atorvastatin" where the row reads "atorvastatin calcium", so any leading run of the name's words counts and the longest run wins - which also keeps a combination product from being read as one of its components, whose tier differs.

**2.5 Structured answer path.** A drug row is projected into the same shape a retrieved chunk has, so it travels the existing prompt, citation, validation and cite-or-refuse machinery unchanged. That satisfies FR-P2-11 by construction rather than by a parallel implementation. An exact row scores above the confidence floor, so the gate needed no special case.

**2.6 Routing set.** 32 hand-labelled cases in `eval/golden/routing-set.json`, scored inside `npm run eval` with a confusion matrix, an aggregate floor and a separate zero-tolerance count.

**Two bugs I introduced and caught before they shipped:**

- The page-furniture rule was `/^(PA - Prior|mail-order|\d+)\b/`, which matched the strength continuation `10 mg` as a page number and silently collapsed three distinct strengths of the same drug into one row. A page number is a bare integer alone on a line. Caught by a duplicate-name check, not by the parse succeeding.
- `ROUTING_FLOOR` was declared below the top-level call that used it, so the router block threw a `ReferenceError` after all 60 answer cases had already run.

**Two routing labels were wrong, and the corpus said so.** R-29 and R-30 expected "ozempic" and "mounjaro" to fall through to prose search on the assumption they were not covered. Both are on this formulary at Tier 3 with prior authorization. The labels were corrected against the table; the router was right.

**Verified against the live index:**

- **2,468 drug rows** ingested, 105 categories, none uncategorized. 1,632 distinct normalized names.
- `what tier is atorvastatin on` returns **Tier 1**, cited `Drug List 2026 · atorvastatin calcium`, route recorded as `structured`.
- `is eliquis covered and how do I appeal a denial` returns **Tier 3 from the row and the Level 1 appeal process from the Evidence of Coverage**, each with its own citation. Route recorded as `structured+rag`. FR-P2-10 and D-062 verified end to end.
- Route and reason are written to `turns` on every answer.

**Router, 32 cases:** accuracy **1.000** against a 0.90 floor, **0** drug questions reaching prose search alone. Confusion matrix is a clean diagonal: 12 structured, 12 rag, 8 both.

**Eval, 60 cases:** faithfulness **1.000**, structural **100%**, refusal **10.0%**, bucket A **37/40**, B **8/8**, C **10/10**. Identical to the Stage 1 run, same four failing cases, despite the heading fix re-sectioning the formulary and re-embedding 675 chunks. Both reports come from one `npm run eval`, which satisfies FR-P2-51 ahead of Stage 8.

**Not delivered, by decision:** provider search. D-051 narrowed D-007 because the directory is ten invented rows, and exact search over invented data produces a confident wrong answer about a member's own doctor. Provider questions keep the v1 refuse-and-route behaviour. Stage 2's first acceptance criterion in `plan-p2.md` is therefore **not met, deliberately**, and is marked as such rather than ticked.

**Known limits:** the router cannot match a misspelled drug name; the fallback is prose search rather than a failure. Two rows collapse on the primary key - the same albuterol strength listed three times as the generic of three different brands, identical in tier and requirements.

---

## Feature: Answer card and freshness (P2 Stage 3)

| Field            | Value                            |
| ---------------- | -------------------------------- |
| Shipped          | 2026-09-08, partially            |
| Cycle            | 12                               |
| Stage of plan.md | `plan-p2.md` Stage 3             |
| Requirements     | `srs-p2.md` FR-P2-13 to FR-P2-17 |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | Where the amount comes from | Extend the answer contract with a cited headline (D-064) |
| 2 | Which freshness date | Both: document date to members, ingest date to operators (D-066) |
| 3 | What decides card versus prose | The headline's presence, one rule one source (D-065) |
| 4 | Where the staleness warning appears | On every answer, with the citation block (D-067) |
| 5 | Card layout and type scale | Label, amount at 40px, sentence, source (D-068) |
| 6 | Where the document date is stored | A `corpus_snapshots` table (D-066) |
| 7 | Staleness wording | Names both years, the consequence and the action (D-067) |

### Phase 2 - Architecting

Nothing in the system knew what "the amount" was: the payload returns claim sentences. Server- or client-side regex extraction was rejected because "there is no $0 deductible" yields `$0` and a two-amount sentence yields whichever comes first - a wrong number rendered at 40px is the most legible possible way to be wrong.

### Phase 3 and 4 - Specs

`AnswerPayload` gains `headline: { label, amount, citationIds } | null`, validated by the same hand-rolled parser that guards claims. `corpus_snapshots` holds both dates. `stalenessWarning(planYear, now)` takes the clock as a parameter so the boundary is tested rather than waited for. No new dependencies.

### Phase 5 - Planning

Contract, prompt, storage, API, web, verification. Planned inline; the forks were settled before sequencing began.

### Phase 6 - Writing Code

**Delivered and verified:**

- **The contract field.** `headline` is validated like a claim: rejected without a citation, without a label, without an amount, and rejected outright on a refusal. A bare figure never renders, because "$10" alone does not say copay, deductible or maximum.
- **Both corpus dates.** `migrations/007_corpus_snapshots.sql`, written at ingest, read at boot. The manifest that holds the document date lives under `data/`, gitignored and absent from the container - the 2026-09-08 outage class, avoided by storing it.
- **Staleness.** Fires when the wall-clock year passes the corpus plan year, compared in **UTC**: the container runs UTC while members are in Eastern, and a local comparison would move the boundary with the deployment. Erring up to five hours early only tells a member to check sooner. Attached to the citation block and appended to the spoken answer, so it survives print, copy and speech.
- **Citation completeness.** `citationLabel` throws rather than rendering a citation missing a plan year or contract, and a test asserts the browser builds no label itself, so the server rule cannot be bypassed.
- **Card markup and CSS**, shipped dormant. Amount at `--text-heading` (40px) in forest ink on cream: **12.10:1**, past AA large-text (3:1) and normal-text (4.5:1).

**Not delivered: FR-P2-13, the amount as the dominant element.** See D-069. Filling the headline needs an instruction in the system prompt, and the instruction is not free. Measured at temperature 0 against an identical index:

| | Without | With the headline rule |
| --- | --- | --- |
| Faithfulness | 1.000 | 0.989 |
| Bucket A | 37/40 | 36/40 |
| A-22 faithfulness | 1.0 | 0.6 |
| A-31, a pharmacy question D-036 says the corpus cannot answer | refused | **answered** |

Seven standing rules became eight, and rule 4 is the refusal rule. Rewording it as display-only, explicitly stating it changes nothing about what is refused, did **not** help; only removing it did, isolated by changing that one line.

**Then a second, smaller finding.** With the rule gone but the field still named in the declared JSON shape, A-22's faithfulness sat at 0.667 rather than 1.0, retrieval unchanged. Naming a field the model is never asked to fill still perturbs it. The field was removed from the shape, leaving `src/rag/payload.ts` byte-identical to Stage 2.

**Recorded for every future prompt change:** adding to `SYSTEM` can weaken the rules already there. Measure against the golden set before keeping it.

**Final verification, prompt byte-identical to Stage 2:** faithfulness **1.000**, structural **100%**, refusal **10.0%**, bucket A **37/40**, B **8/8**, C **10/10**, router **1.000** with zero structured misses. Failing set is the four known cases. A-22 back to 1.0. Written to `eval/results/2026-09-08T2050Z.json`. 479 tests pass.

**Not covered by an automated test:** the plan asks for snapshot tests on three answer shapes. Two of the three - multi-part and prose-only - are the shipped path and are covered. The single-amount card cannot be snapshot-tested because nothing produces a headline, and there is still no component harness; that remains the deferred dependency decision from Stage 1.

---

## Feature: Session UX cluster and chat panel layout (P2 Stage 4)

| Field            | Value                            |
| ---------------- | -------------------------------- |
| Shipped          | 2026-09-08                       |
| Cycle            | 13                               |
| Stage of plan.md | `plan-p2.md` Stage 4             |
| Requirements     | `srs-p2.md` FR-P2-18 to FR-P2-23 |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | How contextual follow-up chips are generated | Not built (D-070) |
| 2 | Help panel shape | Inline expandable region, not a dialog (D-071) |
| 3 | What history stores and how much | Rendered turns, capped at 50 (FR-P2-18) |
| 4 | Chat panel layout | Pinned header and composer, thread scrolls between (D-073) |
| 5 | `start over` versus clearing history | Separate actions (D-072) |
| 6 | Copy format | Plain text: answer, sources, plan, document date |
| 7 | Print scope | Whole transcript, chrome stripped, sources expanded |

**The follow-up question was settled by Stage 3's measurement.** D-069 recorded that adding one rule to the answering prompt moved faithfulness from 1.000 to 0.989 and turned a required refusal into an answer. Generating contextual follow-ups from that prompt is the same move, so it was not made.

**A spec tension worth naming.** FR-P2-23 asks for a help panel that is keyboard reachable and does **not** trap focus. A dialog is defined by trapping focus. The requirement is describing a disclosure region, and that is what was built.

### Phase 2 - Architecting

Four forks, all to the user. D-070 through D-073.

### Phase 3 and 4 - Specs

`web/src/history.ts` owns storage; `web/src/copy.ts` owns the clipboard format. Both are pure and testable without a browser: storage is reached through `globalThis` rather than `window`, so the module compiles in the Node project the tests run under. The panel becomes a three-row grid. No new dependencies.

### Phase 5 - Planning

Storage, copy format, layout, help and chips, print, verification. Planned inline.

### Phase 6 - Writing Code

**Delivered:**

- **History.** Restored on mount, written on every settled turn rather than on unload, which mobile browsers do not reliably fire. Capped at 50, newest kept. Pending turns are never stored.
- **Storage failure.** Reads and writes are wrapped; a private window that throws on access yields an empty history and nothing else changes. Malformed stored content is ignored, and a stored turn missing its citations is **dropped** rather than restored - a restored claim with no source is cite-or-refuse broken by a page reload.
- **Clearing** removes the storage key itself, so the acceptance criterion is verified by inspecting storage rather than by the interface reporting success.
- **`start over`** empties the thread and forgets the plan, so the next question re-asks lazily per D-022. Clearing saved conversations is a separate control.
- **Copy** puts the question, every claim, every source in full, any gap, any staleness notice, the plan name and the document date on the clipboard as plain text.
- **Print** drops the launcher, chips, composer, feedback and icon controls, releases the scrolling region so the whole transcript prints rather than one clipped screenful, and keeps the citation list, which is the point of printing.
- **Help** is an expandable region with `aria-expanded` and `aria-controls`, reachable from the header icon and the chip. Tab passes through and out; nothing is trapped.

**The layout fix.** `.panel` was one scrolling column, so the header, the human path and the composer scrolled away with the thread - FR-13 requires that path present in every state, and it was not present in the state where a member most needs it. The panel is now a three-row grid: pinned header, scrolling thread, pinned foot. `min-height: 0` on the scroll row is what lets a grid row actually shrink. The close control is an icon-only **X at the top right** on the title row, beside a help toggle, both 44px with screen-reader names, in a `flex-shrink: 0` corner so they do not move as the header reflows.

**Verified:** `/api/plans` serves three plans and both corpus dates (`documentsFetchedAt` 2026-09-08, `ingestedAt` 2026-09-08). Web build succeeds. 503 tests pass.

**Answer metrics unchanged by construction:** this stage's diff touches `web/`, tests and ADRs only. No server, prompt, migration or eval change, so faithfulness, the router and the golden set cannot have moved.

**Not delivered:** contextual follow-up chips (D-070). `docs/ideas.md` P2-01 returns to unbuilt.

**Not covered by an automated test:** history surviving an actual browser reload, and the print output's rendered appearance. The storage layer and the stylesheet are asserted; the browser behaviour needs the component harness that remains a deferred dependency decision from Stage 1.

---

## Feature: Interface pass on the assistant panel (P2 Stage 4b)

| Field            | Value              |
| ---------------- | ------------------ |
| Shipped          | 2026-09-08         |
| Cycle            | 14                 |
| Stage of plan.md | not a plan stage; a user-requested interface pass |

### Phase 1 - Requirements

Thirteen items from the user. Seven were unambiguous and were implemented directly. Six needed a decision, and three of those turned out to conflict with something the product already guarantees.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Animation library | Framer Motion 13.2.0 (D-074) |
| 2 | Overlay behaviour | Full overlay, focus held inside (D-075) |
| 3 | A closed panel with text in the box | Keep the draft, restore on reopen (D-076) |
| 4 | Progress messages | Follow real stages, timed fallback within a stage (D-077) |
| 5 | Focus ring on the input | Drawn inside the field (D-078) |
| 6 | Footer wording | Keep the medical line, add the coverage clause back |
| 7 | Chip size | Look smaller, stay 44px tall |
| 8 | Header | Two rows: title with icons, then one context line |

**Three requests could not be done as written, and were resolved rather than silently reinterpreted:**

- **"Make the focus ring go away when typing."** `:focus-visible` matches on **every** focus of a text field, mouse click included - browsers do this deliberately, because a text field must show where typing lands. So it cannot be keyboard-only, and removing it fails `NFR-A11Y-04` and a passing test. What made it ugly was a 3px hard rectangle sitting 2px *outside* a rounded pill. Drawn inside with `outline-offset: -2px` plus a soft halo, it becomes part of the control.
- **"Backdrop, locked page, click outside to close."** That is a modal. Built as one, focus included: a dialog that visually covers the page must cover it for the keyboard too, or a Tab lands on controls hidden behind the dark layer. `FR-P2-23`'s no-trap rule governs the help region, not the panel.
- **"Make the chips smaller."** `NFR-A11Y-02` requires 44px targets and a test enforces it. Side padding halved and type reduced, so they read as smaller; the height a finger has to hit is unchanged.

### Phase 2 - Architecting

D-074 through D-078.

### Phase 3 to 5 - Specs and plan

New modules: `web/src/progress.ts` for the staged messages. `App.tsx` gains the backdrop, the focus loop, the scroll lock and ownership of the draft. Planned inline; the forks were closed before sequencing.

### Phase 6 - Writing Code

| # | Request | Done |
| --- | --- | --- |
| 1 | Header decluttered, Open full page icon-only, tighter padding | Two rows; four icon controls at 44px with zero padding |
| 2 | Talk to a person out of the header, icon on the bottom one | Moved to the pinned foot with a phone icon |
| 3 | Help out of the bottom | Header only |
| 4 | Shorter, smaller, centred footer line | 13 words, caption size, centred, 75% opacity |
| 5 | Input, mic and Ask the same height | All three at 52px |
| 6 | Staged progress messages | Five lines across two real stages, cross-faded |
| 7 | Motion on panel and controls | Panel spring, backdrop fade, message cross-fade; the mic was already CSS-animated and reduced-motion aware, so it was left alone |
| 8 | Copy as an icon beside the feedback buttons | Icon-only, right of the row, turns to a tick when copied |
| 9 | Multiline to four lines, 3000 characters, no outer ring | Textarea, Enter sends and Shift+Enter breaks the line |
| 10 | Thin, quiet scrollbars | 8px, transparent until hover or focus, styled for both engines |
| 11 | Scroll the transcript while the answer is spoken | Root cause: the voice stage sat in the pinned foot at full height and squeezed the thread to a sliver. Capped at 42vh |
| 12 | Backdrop, locked page, click outside to close | With the focus loop D-075 requires |
| 13 | Consistent, lighter spacing, better borders and shadows | Panel shadow, tightened gaps throughout |

**Cost, stated rather than buried:** the bundle went from **78KB gzipped to 119KB**, a 41KB increase, all Framer Motion. On a slow phone connection that is real, for an audience that mostly reads.

**Verified:** 520 tests pass, both typecheck projects clean, web build succeeds. Twelve new assertions cover the focus loop, the scroll lock and its release, the three-way close, the preserved draft, reduced motion, the matched heights, the inside-drawn focus, the four-line cap, the hover-only scrollbars, the capped voice stage, one-control-per-job, and that the footer still says both things FR-15 needs.

**Four tests were brittle rather than wrong.** Your reformatting had wrapped strings like `Reading this answer aloud` across lines, and the assertions matched exact whitespace. They now normalise whitespace instead. One real source bug was found this way: a second `prefers-reduced-motion` block made the first unreachable to anything reading the last occurrence, so the two were merged.

---

## Feature: Grouped long answers (readability pass)

| Field            | Value                      |
| ---------------- | -------------------------- |
| Shipped          | 2026-09-08                 |
| Cycle            | 15                         |
| Stage of plan.md | not a plan stage; a readability pass |

### Phase 1 - Requirements

Brainstormed against measured evidence rather than an impression. On the last eval run: median answer 2 claims and 392 characters; 9 of 36 carry 3+ claims, 3 carry 5+. The longest, A-24 at 1,370 characters, is nine sentences at identical visual weight - the wall is uniformity, not a lack of bold and italic.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Markdown, or something else | Group claims by the source they cite (D-079) |
| 2 | What to do about near-duplicate claims | Leave them visible; the application does not edit cited answers |

**Markdown was ruled out on three counts**, all recorded in D-079: it contradicts FR-32, it needs the prompt change D-069 priced, and it renders model output as markup on a corpus of scraped text.

### Phase 2 - Architecting

Four alternatives weighed in D-079. Bulleting was rejected for reading as a sequence when the claims are not one; doing nothing was a genuine candidate at 8% of answers and was rejected because those answers are the process questions where a member most needs to find one part again.

### Phase 3 and 4 - Specs

`web/src/claims.ts` exposes `groupClaims(claims, citations)`, pure and testable without a browser. A group's heading is the section of its first citation, read off the label `citationLabel` already builds. No new dependency, no server change, no prompt change.

### Phase 5 - Planning

One stage: the pure function with its tests, then the renderer, then styling.

### Phase 6 - Writing Code

Grouping applies only at three or more claims, and only when neighbouring claims actually share sources - one group per claim is the same wall with headings on it, so that falls back to flat rendering. Claim order is never changed.

**Nine assertions on the function**, covering the short-answer fallback, that neighbours sharing a source group together, that non-neighbours never merge, that a different set of sources starts a new group, that order is preserved, that an unknown source yields no heading, and that no claim is dropped or duplicated.

**Three on the renderer**, including that it contains no `dangerouslySetInnerHTML` and no markdown library - FR-32 asserted at the render layer, not just intended.

**Verified:** 555 tests pass, both typecheck projects clean, build succeeds.

**Left alone deliberately:** A-24 opens with two claims saying nearly the same thing. Grouping makes that more obvious rather than less. Suppressing one would put the application in charge of which cited claims a member sees, which is a line this product has not crossed.

---

## Feature: Synthetic member records (P2 Stage 5)

| Field            | Value                            |
| ---------------- | -------------------------------- |
| Shipped          | 2026-09-09                       |
| Cycle            | 16                               |
| Stage of plan.md | `plan-p2.md` Stage 5             |
| Requirements     | `srs-p2.md` FR-P2-24 to FR-P2-29 |

### Phase 1 - Requirements

| # | Question | Answer |
| --- | --- | --- |
| 1 | How a record field becomes citable | The Stage 2 projection, plus a third router path (D-080) |
| 2 | Part D stage: derived or stored | Derived from spend against per-plan thresholds (D-081) |
| 3 | What a record citation reads as | `Your member record · Claim CLM-0031 · What you owe` (D-082) |
| 4 | Where the five members live | A typed seed module applied by a command (D-083) |

### Phase 2 - Architecting

D-080 through D-083. The shape was already proven: Stage 2 projected a drug row into the retrieved-chunk shape so it travelled the existing prompt, citation and cite-or-refuse path. A record field does the same, so cite-or-refuse binds record claims with no new code and **no prompt change** - D-069's cost is not paid again.

### Phase 3 and 4 - Specs

`migrations/008_member_records.sql` creates five tables. `src/members/` holds the typed seed, the derived stage, and the member-scoped queries. `RoutePath` gains `member`. `CitableKind` widens the citation layer only - a record has no byte floor, no snapshot and no plan year of its own, so `DocumentKind` stays a corpus concept. No new dependency.

### Phase 5 - Planning

Derived stage, schema, seed, queries and projection, router path, commands, verification.

### Phase 6 - Writing Code

**Verified live:**

- `npm run ask:member -- --id=1 "what did my last claim cost"` returns **$210 billed, $200 plan paid, $10 owed**, cited `Your member record · Claim CLM-0031 · What you owe`.
- The prior authorisation question returns **in review, no decision yet**, cited to `Prior authorisation PA-0114 · Status`.
- **FR-P2-29 verified**: "what is my dental allowance left and what does the plan cover for dental" returns one answer citing the member record **and four plan documents**, each attributed to its own source.
- `scripts/member-scope-check.ts`: 5 records, **0 leaks**, and inverting its predicate reports 100, so the check can fail.
- The derivation covers all three drug stages across the five members, asserted rather than assumed.

**Thresholds read from the corpus, not recalled:** H5141-004 deducts $150 on tiers 3-5, H5141-007 deducts $220, both reach catastrophic coverage at $2,100. **No seeded member is on H8010-002** - its Part D deductible is not stated in the converted Evidence of Coverage, and rule 6 forbids inventing it.

**Two defects found in my own code:** `Promise.all` over one `pg` client issues overlapping queries, which pg deprecates and will remove in 9.0 - the reads are sequential now. And extending the corpus `DocumentKind` broke `BYTE_FLOORS`, which was the type system correctly refusing: a member record has no byte floor. Only the citation layer widened.

**Eval: faithfulness 1.000, structural 100%, refusal 10.0%, bucket A 37/40, router 1.000 with zero structured misses.** Four known failures, nothing new. 596 tests pass.

**One golden case was mis-specified and is now fixed.** PAIR-05a asked what an out-of-network specialist costs on the HMO and matched a phrasing. Across three runs the model gave three *different, all correct, all cited* answers: the network rule, the authorised exception, and the unavailable-specialist exception. The case now asserts the **absence of an out-of-network price**, which is the structural difference the pair exists to show, rather than one wording of it.

**Eval noise, now quantified rather than assumed.** At temperature 0, two borderline cases moved between runs with no code change: PAIR-05a above, and A-21, where the judge scored 0 for a clause the model added - "before the drug will be covered" - that is not literally in the cited chunk. A-21 still passed its own assertion. This is the first time run-to-run variance has been measured, and it means a single failing run is not by itself proof of a regression.
