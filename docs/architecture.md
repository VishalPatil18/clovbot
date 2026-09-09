# Architecture

> How a question becomes a cited answer, and why each layer is where it is.
> The short version, with diagrams, is in the [README](../README.md#architecture).

---

## The shape of it

Three deployable pieces, one database, and a pipeline that never runs in production.

| Piece | Runs on | What it owns |
| --- | --- | --- |
| Web | Vercel (static) | The panel and full-page interface, voice capture and playback, on-device conversation history. Also proxies `/api/*`, which is what keeps the session cookie first-party. |
| API | Cloud Run (container) | Routing, guardrails, retrieval, the answer contract, sessions, rate limits, the turn log. |
| Corpus pipeline | A laptop, before deploy | Fetching, converting, chunking, embedding and typing the plan documents. |

The running service **never opens a PDF**. Everything it answers from is already rows in Postgres, addressed by a snapshot id baked in at deploy time. That is what makes a deploy reproducible: the container has no `data/` directory, and pointing it at an older snapshot is a configuration change rather than a rebuild.

---

## The answer contract

This is the decision the rest of the system is built around.

A conventional RAG system asks the model for prose and then tries to check it. This one asks for **typed claims**:

```jsonc
{
  "claims": [
    { "text": "The copay for an in-network specialist visit is $10.",
      "citationIds": ["h5141-004-sob-doctors-office-002"] }
  ],
  "unanswered": [],
  "refusal": null
}
```

The application then does three things the model cannot be trusted to do:

1. **Validates the payload.** A claim with no citation ids fails the schema. There is no partial render.
2. **Checks containment.** Every cited id must be one that was actually retrieved this turn. A model that invents a plausible chunk id is caught here, not by a reader.
3. **Renders the prose itself.** The sentences a member reads are assembled by the application from the claims, and the citation markers are numbered in order of first appearance.

The consequence worth stating: **cite-or-refuse is not a prompt instruction, it is a type.** An uncited claim is not a bad answer that gets flagged, it is a payload that fails validation and never reaches a screen. Every capability added later - typed drug rows, member record fields, Spanish - is projected into the same citable shape and travels this path unchanged.

---

## Retrieval

### Scoping happens in SQL, before ranking

Two plans on one contract share near-identical prose with different amounts. Retrieve first and filter after, and the wrong plan's copay wins on similarity. So the plan, the plan year and the language are all `where` clauses **inside** the ranking function, not a filter applied to its output.

```sql
with scoped as (
  select c.* from chunks c
   where (c.contract_id = p_contract_id or c.contract_id = '*')
     and c.plan_year = p_plan_year
     and (c.plan_id = p_plan_id or c.plan_id = '*')
     and c.language = p_language
)
```

The `'*'` wildcard is how contract-wide documents - the drug list, Clover's public pages - answer under every plan without being duplicated per plan.

### Hybrid, fused by reciprocal rank fusion

Dense vectors (HNSW, cosine) and lexical search (`tsvector`, GIN) run over the same scoped set and are fused by RRF with `k = 60`. Each half retrieves four times the final limit before fusion.

The lexical half stems in the row's own language. Spanish text under the English configuration strips English stopwords and stems nothing, which would quietly make half the corpus lexically invisible. The generated column picks its configuration with a `case` over constants, because casting a column to `regconfig` is a catalog lookup and therefore not immutable enough for a generated column to accept.

### Then a reranker, then a floor

A local ONNX cross-encoder reorders the candidate pool. Below a calibrated confidence floor the turn refuses rather than answering from the best of a bad set. The floor is a measured value in `eval/results/floor-calibration.json`, not a round number.

### Three additive paths

The router picks paths, plural. A question that names an indexed drug **and** asks about a rule keeps both halves:

- `structured` - an exact lookup against typed drug rows
- `rag` - hybrid retrieval over prose
- `member` - the signed-in member's record, only for the topics that need it

Selection is a longest-prefix match against the set of indexed drug names, not a classifier. A tier question about a drug we hold cannot degrade to prose search, which is the failure the whole structured path exists to prevent.

---

## The corpus pipeline

Discovery reads Clover's own catalog endpoints, fetching honours `robots.txt` at
one request every 1,500 ms, and conversion shells out to poppler. 29 documents
attempted, 26 fetched, 3 provider directories generated as labelled demo data;
2,737 chunks reached the index, 1,913 English and 824 Spanish. Full provenance,
with every figure measured: **[docs/corpus.md](./corpus.md)**.

### Why the Summary of Benefits needs coordinates

One PDF describes **two plans in two columns**. Extracted as text, the columns interleave and a member gets the other plan's copay. So it is parsed from word coordinates: the `(Plan 004)` / `(Plan 007)` header row gives each column's x position, and gutters are measured on **each page** rather than inherited, because the document alternates recto and verso margins.

A page carrying money in two columns that cannot be attributed to a plan **throws**. That rule is why a lowercase `(plan 004)` in the Spanish edition surfaced as a build failure rather than as silently merged amounts.

### Chunking and context

Sections are split on headings, and each chunk carries a contextual prefix naming the document, plan, plan year and section path before it is embedded and lexically indexed. Chunks with no usable heading get a generated one-line description, cached on disk so a re-run does not re-derive it.

### The drug list is a table, not prose

The formulary is parsed to typed rows - name, tier, therapeutic class, utilisation-management flags - read from the column geometry of each page's own header. A drug question is answered by a lookup that either matches or does not, with no ranking and no floor.

---

## Data model

| Table | Holds | Notes |
| --- | --- | --- |
| `chunks` | Indexed text, embedding, plan scope, language | HNSW + GIN. `search_vector` is generated, so it cannot drift from the text. |
| `drugs` | Typed formulary rows | Keyed on snapshot and normalised name. |
| `corpus_snapshots` | When documents were fetched and indexed | Feeds the freshness notice. |
| `turns` | Every question: route, reason, chunk ids, outcome, latency | Questions are redacted before insert. |
| `callbacks` | Escalation requests | Question, plan, documents already searched. |
| `rate_events` | Per-session and per-IP counters | In Postgres so the count survives a restart. |
| `members` and four record tables | Synthetic member data | Row-level security, enabled and forced. |
| `login_codes`, `member_sessions` | Sign-in | Scrypt hashes only. Exempt from row-level security, by necessity and on the record. |
| `member_access_log` | Every authenticated read | Column and row id, never a value. Insert and select only. |

### The security boundary

Since P3 the application connects as a role that **cannot bypass row-level security** and owns nothing. Policies compare each row to an identity set transaction-locally on the connection, which the pooler makes necessary rather than optional: a session-level `SET` would ride a returned connection into whoever borrows it next.

The honest limit, stated in [real-phi.md](./real-phi.md): the identity is put there by application code. Row-level security moved the trust boundary from every query to one function. That is a large improvement and it is not the database deciding independently.

Two tables are exempt and cannot be otherwise. `login_codes` and `member_sessions` are read to discover *who the member is*, before an identity exists to filter by. They are protected by grant, the exemption is a table comment, and the schema check asserts it by name so it stays a decision.

---

## Streaming and the interface

`/api/ask` is server-sent events. The events are `needs_plan`, `progress`, `answer`, `turn`, `offer_callback`, `rate_limited`, `session_ended` and `error`. Progress events carry no content: the member sees the assistant working without any text being committed before validation has run.

One consequence learned the hard way: a failure **after** the answer has been sent is logged rather than sent, because an error event arriving over a delivered answer replaces a correct, cited answer with something the member cannot act on.

---

## Caching

Three caches, one store, and one property that makes them safe: **emptying all of them changes no answer, only the time taken to produce one.** That is asserted by test, not assumed.

| Cache | Key | Invalidated by |
| --- | --- | --- |
| Answers | snapshot, contract, plan, plan year, language, normalised question | Re-indexing, two ways: a new snapshot id cannot hit an old key, and ingest clears the entries for the id it writes |
| Query embeddings | text, embedding model | Nothing; a new model is a new key |
| Audio | text, voice, provider | Nothing; a new voice is a new key |

**The answer cache is keyed on the question, not on its meaning.** `docs/ideas.md` P4-01 describes semantic caching above a similarity threshold and warns in the same line that a loose one "collides two similar questions with different copays and returns a wrong answer". That is not hypothetical: "what is my specialist copay" and "what is my out-of-network specialist copay" are one word apart and ten dollars apart. Exact keying removes the question. D-100.

**A turn carrying a member id is never cached.** It is the only route by which one member's record could reach another, and a cached answer would also make the access log record a read that never happened.

**Only answered turns are cached.** A refusal costs no generation, and a failure must never be served twice. A hit is recorded in the turn log with its provider as `cache`, so it cannot be mistaken for a model call.

**Ingest clears the answers for the snapshot it writes, on failure as well as success.** The snapshot id in the key already handles a re-ingest under a *new* id. This handles re-running into the *same* one, where the chunks change and the key does not, which is what a parser fix produces. It runs in a `finally` because a run that dies part-way leaves a half-written corpus, which is when a cached answer citing text that no longer exists is most likely; and it runs last, so a question asked during the run cannot repopulate the cache from the corpus being replaced. Embeddings and audio are not cleared: a question's vector does not depend on the corpus, and a changed answer produces a new audio key rather than a wrong recording. D-101.

Everything lives in Postgres rather than memory or a container filesystem. On Cloud Run an in-process cache dies with the instance and is shared with nothing; the audio cache previously had both problems.

## Feedback

The yes/no control under each answer writes to the turn it rates: the rating, the answer the member read, one of four fixed reasons after a no, and the time.

Three boundaries make it safe to keep.

**No free text.** Identifier redaction removes a member id or a date of birth before anything is stored. It does not remove "my doctor said I have diabetes". Four fixed reasons are countable, are enforced by a check constraint as well as by the form, and are quicker to answer than typing.

**No answer text from a signed-in turn.** That answer holds a claim amount or a prior-authorisation status, and `turns` has no policy over it. Keeping it out is cheaper than writing it and protecting it, and it keeps `docs/real-phi.md` from owing an account of a second store of record data.

**Analysis is blind to the session.** The turn keeps its session id because the loop breaker counts consecutive refusals within one, but the `feedback_report` view excludes it. The store is pseudonymous, not anonymous, and is described that way.

The point of collecting it is `npm run insights`, which lists answers a member rated wrong with their reason and route. Those are candidate golden-set cases, which is the mechanism this project already uses to improve answers and gate regressions. There is no fine-tuning pipeline and none is implied: answers here come from retrieval and a prompt, not from weights.

## Taking the conversation away

The export renders a PDF **in the browser** from the conversation already in memory: every question, every answer, the numbered sources as the member saw them, the plan, the date the documents were collected, and the standing notices. A page-one warning appears when any answer cites the member's own record.

Nothing is posted to the service to be rendered. The transcript of a signed-in member holds their claim amounts, and sending it to a renderer would put that back on the wire and into request logs, which is the transit path row-level security and the access log exist to narrow. D-103.

The renderer is fetched by dynamic import on first press, so it is absent from the bundle a member downloads to ask a question. The document model is separate from the typesetting, which is what lets the tests assert what the file says without parsing a PDF. The print stylesheet stays as the fallback and as the path for anyone who wanted paper.

## Voice

A three-tier chain with a circuit breaker: ElevenLabs, then Fish Audio, then the browser's own synthesiser. The last tier cannot run out of credits, which is the reason it is there. A degrade is announced rather than silent, because an unexplained change of voice reads as a fault to an audience with low trust in the technology.

Synthesised audio is cached by text and voice id, so a repeated answer is never synthesised twice, and the Spanish voice is part of the key.

---

## What is deliberately not here

- **No backend framework.** A dozen routes and one SSE stream.
- **No vector database.** Postgres already holds the rows, the lexical index and the security policies.
- **No agent loop.** The router is deterministic and the paths are known in advance.
- **No provider search.** The corpus has no real provider directory, and precise structured search over invented rows produces a confident wrong answer about a member's doctor.
