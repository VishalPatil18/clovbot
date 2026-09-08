# Project Context - Compressed Snapshot

> Single source of truth for "what exists right now." Read this before answering questions about project state. Do not re-derive from source.
>
> Current State, Key Decisions and Open Questions are edited in place. Session History is append-only: never rewrite a past entry, correct it in a new one.

| Field                | Value                          |
| -------------------- | ------------------------------ |
| Snapshot date        | 2026-09-08                     |
| Current stage        | P1 Stage 5 complete. Stage 2 skipped. Next is Stage 6. |
| Last feature shipped | Golden set and eval harness, red by design. |

---

## 1. What exists

- **Research briefing** - `docs/research-init.md`, 56 lines (dense, ~15K). Clover snapshot, Medicare Advantage rules that constrain the build, call-center economics for the ROI case, competitive landscape, 65+ UX findings, architecture notes. This is the only sourced-fact corpus in the repo right now.
- **Design system** - `design/DESIGN.md`, 405 lines, written and non-placeholder.
- **Working contract** - `CLAUDE.md`, rewritten this session. See section 3.
- **Specs, real and frozen** - `claude/srs.md` v1.1.0, 30 functional and 19 non-functional requirements. `claude/plan-p1.md` through `plan-p4.md`, staged build plans. `claude/design-decisions.md`, 34 ADRs. `docs/call-drivers.md`, `docs/testing-strategy.md`, `docs/build-journal.md`.
- **Corpus pipeline** - `src/corpus/`, nine modules. Four commands: `corpus:discover`, `corpus:fetch`, `corpus:convert`, `corpus:report`. Produces a timestamped snapshot under `data/` (gitignored).
- **RAG path** - `src/rag/`, eight modules: chunker, provenance, ingest planner, context generator, prompt, providers, store, CLI. Two commands: `ingest`, `ask`.
- **Migrations** - `migrations/002_hybrid_retrieval.sql`, applied by hand in the Supabase dashboard.
- **Acceptance script** - `scripts/stage4-check.ts`, prints the smoke-set and fusion numbers.
- **Eval harness** - `eval/`: 50-case golden set, faithfulness judge, structural citation check, scoring, committed results. Commands `eval` and `eval:calibrate`.
- **CI** - `.github/workflows/ci.yml`. Typecheck plus tests on every push; judge calibration and the golden-set eval on pull requests.
- **Retrievability report** - `docs/corpus-report.md`, generated.

## 2. What works (verified)

- **Corpus fetch and convert.** 14 documents for contract H5141, plans 004 and 007, 2026, Hudson County NJ. 0 failed, 0 blocked, 2 synthetic. The Evidence of Coverage is 199 pages converting to 498KB of text in 0.25s.
- **Two-plan column extraction.** One Summary of Benefits PDF serves plans 004 and 007 side by side. Each plan extracts to its own markdown, verified by hand against the source PDF: specialist copay $10 in-network / $20 out for 004, $2 / $15 for 007. No cross-plan leakage.
- **End-to-end cited answer.** `npm run ask -- "what is the specialist copay" --plan 004` returns the correct amount with document, contract, plan, plan year and section, in roughly 1.4s. Plan 007 returns its own different amount from the same source PDF.
- **Determinism.** The same question returns the same five chunk ids across runs.
- **Redaction.** "my member id is 1234567890" persists as "my member id is [redacted]".
- **TLS.** Supabase CA pinned, certificate verification on.
- **Full corpus indexed.** 1476 chunks across Summary of Benefits, Evidence of Coverage, Annual Notice of Change, formulary and public corporate pages, for plans 004 and 007. The pharmacy directory is deliberately excluded.
- **Ingest is idempotent.** Two consecutive runs report 0 new or changed, keep the same snapshot id, and leave 1476 rows with 1476 distinct ids and zero missing provenance.
- **Hybrid retrieval.** Dense HNSW and lexical GIN fused by Reciprocal Rank Fusion in one Postgres function, both halves scoped to the plan before ranking. Measured: rare drug ORSERDU is dense rank 9 and hybrid rank 1; the paraphrase "what does it cost to see a skin doctor" is absent from lexical and hybrid rank 2.
- **Smoke set.** 10 of 10 questions retrieve the expected source document.
- **Eval harness, measured 2026-09-08 against snapshot `2026-09-08T0313Z`.** Faithfulness **0.803** against a 0.90 floor. Structural citation compliance **76%**, twelve answers carrying an uncited factual claim. Refusal rate **0.0%**. Bucket A accuracy **17/30**. The adversarial prompt-injection case passes. The build correctly fails on faithfulness and structural compliance, which is what Stage 5 was for; Stage 6 makes it green.
- **Judge calibrated.** 14 sentence-level judgements across six fixtures, zero disagreements. The deliberately unfaithful fixture scores 0.00, the partial one 0.67.
- **Synthetic provider data is not cited as fact.** Asked whether a named doctor is in network, the assistant states the directory is demo data and routes to a human. The Stage 1 banner mitigation holds.
- **Tests.** 172 passing. 26 failing, all `not implemented` stubs belonging to Stages 6 through 9.

## 3. Locked decisions

Set by the user, binding for the whole project. Full statement in `CLAUDE.md` section 1.

- Spec before code. No production code without an entry in `srs.md` or `features.md`.
- TDD, no exceptions. Failing test first.
- **Zero PHI in v1.** No member auth, no claims, no prior-auth status. Anything needing member identity goes to the v2 roadmap.
- **Cite or refuse.** Every bot answer names its source document, or it declines and offers a human. No third path.
- Design forks go to the user with options and tradeoffs. Claude does not decide. The call is logged as an ADR in `design-decisions.md`.
- No invented Clover, Medicare, or CMS facts. Only `docs/research/` and the scraped corpus.
- Ask before adding any dependency.
- Zero monetary cost. Free tier, open source, or local only.

The research briefing's recommended shape (RAG over public plan documents, escalate everything else) matches these constraints but is **not yet ratified** as the product decision. That happens in `/spec-requirements`.

## 4. What's next

1. **Stage 6** - reranking, confidence floor, per-claim cite-or-refuse, implemented until the Stage 5 harness goes green. The dominant failure is per-claim citation: the model cites its first sentence and leaves later factual sentences uncited. FR-32's structured payload is the fix.
2. **Refusal is not currently representable.** It is inferred from the absence of citations, which cannot distinguish a cited "not found" from a factual answer. FR-32's typed refusal branch fixes this, and until then bucket B, bucket C and cases A-31 and A-32 are marked not-yet-enforced.
3. **Stage 2, deferred** - the voice latency spike was skipped. NFR-PERF-03 and 04 stay unmeasured until Stage 9.
4. **Gemini key** - rejected as invalid, so the D-034 fallback has never executed.

## 5. Active environment

- **Branch:** `development` (main branch is `main`)
- **Language / framework / runtime:** TypeScript strict, Node 26, native type stripping. No framework.
- **Package manager / test runner / deploy target:** npm · Vitest · not yet deployed
- **Runtime dependencies:** `pg` only. Dev: `@types/node`, `@types/pg`, `typescript`, `vitest`.
- **System prerequisites:** `pdftotext` and `pdfinfo` from poppler.
- **Services running:** Supabase Postgres with pgvector, `chunks` and `turns`. Azure OpenAI gpt-4o and text-embedding-3-small.
- **Env vars:** documented in `.env.example`. `GEMINI_API_KEY` is present but the key is rejected, so the fallback is untested.
- **Budget:** $0. See the zero-cost rule.

## 6. Constraints

- 48-hour case study interview, solo, roughly 40 working hours. Scope for a narrow defensible demo, not breadth.
- Audience is Clover Health members, mostly 65+. WCAG AA, large targets, plain language are requirements, not polish.

## 7. File map

| Area              | Path                    | State                    |
| ----------------- | ----------------------- | ------------------------ |
| Working contract  | `CLAUDE.md`             | written                  |
| Research corpus   | `docs/research-init.md` | written                  |
| Design system     | `design/DESIGN.md`      | written                  |
| Requirements      | `claude/srs.md`         | scaffold                 |
| Plan              | `claude/plan.md`        | scaffold                 |
| Features log      | `claude/features.md`    | scaffold                 |
| Decisions (ADR)   | `claude/design-decisions.md` | scaffold            |
| Application code  | none                    | does not exist           |
| Test suite        | none                    | does not exist           |

## 8. Open questions

- [x] Stack. TypeScript, Node, Supabase pgvector, Azure OpenAI. D-018, D-034.
- [x] What the v1 corpus is. Contract H5141, plans 004 and 007, 2026, Hudson County NJ, fetched through an undocumented JSON API and snapshotted. D-030, D-033.
- [ ] What "cite the source" renders as for a 65+ reader. The CLI prints document, contract, plan, plan year and section; the web surface in Stage 7 needs a real design.
- [ ] Escalation path when the bot refuses. Stage 8.
- [ ] Reranker choice. Still the load-bearing open question in `srs.md` §10, and Stage 6 cannot start without it.
- [ ] gpt-4o versus gpt-4.1-mini. gpt-4o is deployed and in use. Stage 5's eval harness can measure whether the cheaper model holds the answer contract.

---

# Session History

> Append-only. Newest at the bottom. One entry per session that changed code, design, or architecture.
>
> Template:
> ```
> ## YYYY-MM-DD - <title>
> **Did:** <what changed>
> **Files:** <path> (create|update|delete) - <why>
> **Decisions:** <decision> - <rationale>
> **Open:** <follow-ups>
> ```

## 2026-09-07 - Working contract locked

**Did:** Established the behavior contract for the whole project before any spec or code. Rewrote `CLAUDE.md` from the 399-line scaffold template into a 94-line contract carrying the user's eight rules. Logged it in the changelog. Populated this file with real state.

**Files:**
- `CLAUDE.md` (update) - replaced template with the contract. Cut unfilled Environment placeholders and a stale block referencing another repo's stack (Electron, Drizzle, `lib/db/repo/**`) that would have misled every session.
- `CHANGELOG.md` (update) - logged the contract under `[Unreleased] > Changed`.
- `claude/context.md` (update) - this file, replaced scaffold with real state.

**Decisions:**
- ADRs live in `claude/design-decisions.md`, not the `docs/design-decisions.md` the user first named. Reason: the file already exists and the `/spec-*` skills read and write it. Two logs would drift. Flagged to the user, reversible.
- The changelog entry stands even though a contract rewrite is invisible to a member, which the contract's own section 8 argues against. Flagged, user's call.

**Open:** Everything in section 8. Next action is `/spec-requirements`.

## 2026-09-07 - Stage 1 corpus spike and Stage 3 thinnest answer

**Did:** Built the corpus pipeline and the first end-to-end cited answer. Stage 2 skipped at the user's instruction.

**Files:** `src/corpus/*` (create) - discovery, fetch, convert, column extraction, synthetic provider data, report, snapshot store, CLI. `src/rag/*` (create) - chunker, prompt, providers, store, CLI. `src/logging.ts` (update) - implemented FR-31 redaction, which Stage 3 needed before it could persist a question. `.env.example`, `certs/supabase-ca.crt` (create). 76 corpus tests and 27 RAG tests added.

**Decisions:** D-030 discovery snapshot replayed. D-031 column split by bounding-box gutter. D-032 plan 004, superseded same session by D-033 plans 004 and 007. D-034 Gemini generation fallback, never embeddings.

**What the live run taught:**
- Clover's plan documents are behind two undocumented JSON endpoints. `zipcode=` is accepted and silently ignored; only `county_id` filters, so a wrong parameter returns all five states with no error. The parser asserts the returned set is state-scoped rather than trusting the request.
- The Summary of Benefits is one PDF for two plans, side by side. Extracting the wrong column is a silent wrong answer on the highest-volume call driver. Header midpoints do not locate the column break, because headers are centred; the gutter has to be found empirically.
- Temperature 0 is not determinism. The same refusal question cited a disclaimer chunk on one run and nothing on the next. This is the argument for Stage 6's confidence floor rather than trusting the model to self-refuse.

**Open:** Reranker choice blocks Stage 6. Gemini key invalid. Voice budgets unmeasured.

## 2026-09-08 - Stage 4: full ingest and hybrid retrieval

**Did:** Generalised chunking to every document kind, added contextual prefixes, plan-year enforcement, idempotent ingest, and Reciprocal Rank Fusion over dense plus lexical retrieval. Indexed 1476 chunks.

**Files:** deleted `src/pipeline.ts`, `src/corpus.ts`, `tests/integration/` - they encoded `contractId: "H5141-001"`, merging contract and plan, which would have reintroduced the leak D-033 exists to prevent. Created `src/rag/{provenance,ingest,context}.ts`, `migrations/002_hybrid_retrieval.sql`, `scripts/stage4-check.ts`. Rewrote `src/rag/chunk.ts` and `src/rag/store.ts`. `src/types.ts` Provenance now carries planId.

**Decisions:** D-035 deterministic contextual prefixes from headings, model only for the 1.7% with no heading. D-036 pharmacy directory excluded from the index.

**What the live run taught:**
- **Chunk ids omitted the document, so twelve chunks collided and overwrote each other.** Corporate pages share headings like "Learn More". Silent content loss that only surfaced because idempotency reported one chunk permanently changed.
- **LLM-generated context makes ingest non-idempotent.** Regenerating each run produced different text, so unchanged chunks looked changed and re-embedded forever. Frozen to disk, as `docs/testing-strategy.md` section 4 already required.
- **The Azure quota is 29,000 tokens per minute, not requests.** Retry alone could not clear it. Pacing against a token budget, plus persisting each batch, made a full ingest survivable.
- **A check that cannot fail is worse than no check.** The first fusion measurement matched any chunk from the right document, so every mode scored rank 1 and the criterion looked met. Matching the chunk that actually contains the term revealed dense ranking ORSERDU ninth.
- **D-004 is narrower than "hybrid is better".** For a common drug dense is already rank 2. Fusion earns its complexity on rare tokens and on paraphrases lexical cannot see at all.

**Open:** Reranker choice blocks Stage 6. Gemini key invalid. Voice budgets unmeasured.

## 2026-09-08 - Stage 5: golden set and eval harness

**Did:** Built the 50-case golden set and the harness that scores it. Ran it against the Stage 4 system and recorded the first real numbers.

**Files:** created `eval/golden/golden-set.json`, `eval/harness/{score,run,calibrate}.ts`, `eval/judges/faithfulness.ts`, `tests/fixtures/answers/judge-fixtures.json`, `.github/workflows/ci.yml`, `tests/unit/eval-{score,fixtures}.test.ts`. Committed `eval/results/`.

**Measured:** faithfulness 0.803 against a 0.90 floor, structural compliance 76%, refusal rate 0.0%, bucket A 17 of 30. Build fails, as designed.

**Decisions:** D-037 resolves the reranker open question as a local ONNX cross-encoder, model chosen by measurement in Stage 6.

**What the run taught:**
- **Stage 4's chunk id change silently broke citation parsing.** New ids carry the document kind, which contains underscores; the citation regex allowed only letters, digits and hyphens. Every valid citation parsed as none, so correct cited answers were recorded as refusals. It looked like a plausible outcome rather than an error, which is why it survived a whole stage.
- **The dominant quality gap is per-claim citation.** The model cites its first sentence and leaves later factual sentences uncited. That is precisely what FR-32 exists to make structurally impossible.
- **Refusal cannot be inferred from citation count.** An answer that declines but cites the document explaining where to go is neither a refusal nor a factual answer under that heuristic.
- **The synthetic provider directory mitigation works.** The assistant states the directory is demo data rather than citing invented doctors, which was the rule 6 risk raised when synthetic data was approved.

**Open:** Stage 6 reranker model selection. Gemini key invalid. Voice budgets unmeasured.
