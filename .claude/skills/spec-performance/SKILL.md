---
name: spec-performance
description: Measurement-first performance work - backend latency, database queries, frontend load, memory, cost. Use when something is slow, before adding a cache, when optimizing, or when the user says "performance", "slow", "optimize", "speed up", "latency", "N+1", "page load", or invokes `/spec-performance`. Refuses to optimize without a measurement and a target; verifies every fix with a second measurement.
---

# spec-performance

The iron law: **no optimization without a measurement, and no "it's faster now" without a second measurement.** Guessed bottlenecks are wrong more than half the time; optimizing a guess makes code worse and no faster.

---

## Read first

- `claude/srs.md` for any stated performance target (load budget, response SLA). If none exists, get a number before touching code.
- The specific hot path named by the request. Do not profile the whole app.

## The loop (never skip a step)

1. **Define the target.** "Fast" is not a spec. Get a number: "list endpoint p95 < 300ms", "interactive < 2s on mid-range mobile". Without a target you cannot stop, and unstoppable optimization destroys codebases.
2. **Measure where the time goes.** Profile or trace the real path with realistic data volume - 10 rows in dev hides everything. Time one request end-to-end, split into segments: network / app CPU / DB / external / rendering.
3. **Fix the biggest segment only.** One change at a time.
4. **Re-measure the same way.** Keep the change only if the number moved meaningfully. Record before/after in the commit/PR.
5. Repeat until the target is met, then **stop** - the target is permission to stop.

## Where the time usually is (check in this order)

### Database - the culprit ~70% of the time in CRUD apps

- **N+1 queries** - the most common backend perf bug. Count queries per request; an ORM loop lazy-loading a relation is the tell. Fix with joins/eager loading/batched `IN`. Any list endpoint doing > 5 queries deserves suspicion.
- **Missing indexes** - `EXPLAIN ANALYZE` the slow query. A sequential scan on a big table in a hot path means index the filter/sort columns (composite, equality columns first).
- **Fetching too much** - select only needed columns; paginate everything (keyset for deep pages); never load all rows to count or to filter what SQL can filter.
- **Chatty transactions** - many round trips in one request; batch into fewer statements, bulk-insert multiple rows.

### External calls

Sequential awaits that could be parallel; missing timeouts (a "slow" system is often one hung dependency); calls in loops needing batching; synchronous calls that belong in a background job.

### App code (only after DB and I/O are clean)

Accidental O(n^2) (a lookup in a list inside a loop -> use a set/dict); repeated parse/serialize of the same data; loading whole files into memory to stream them.

### Frontend

Measure with the browser's own tools on throttled mobile, not your dev machine. Usual suspects in order: oversized images, render-blocking or oversized JS bundles (analyze; lazy-load routes and heavy components), waterfalls of dependent fetches, missing cache headers, re-render storms (fix state placement before reaching for `memo`). Perceived speed counts: skeletons, optimistic updates, and streaming beat a spinner at equal latency.

## Caching is the last resort, not the first

A cache is a bug you have not had yet (staleness, invalidation, memory). Before caching: fix the query, add the index, batch the calls. Cache only when the computation is irreducibly expensive and read-heavy - then name the source of truth, invalidation, max staleness, and tenant-scoped keys.

## Anti-patterns to refuse

- Micro-optimizing readable code in an app whose time is 95% I/O.
- Adding Redis/queues/read-replicas to fix what one index fixes.
- "It feels faster" as evidence. Numbers or it did not happen.
- Benchmarking dev builds, cold caches, or localhost and drawing production conclusions.

## Output and memory

- Present before/after numbers for the specific bottleneck, and the single change that moved them.
- Add a regression guard (a test or budget) so the win does not silently rot.
- Record the target and result in `claude/context.md` and the commit body.

## Red flags

- Optimization with no profiling data behind it.
- N+1 patterns, list endpoints without pagination, images without dimensions/lazy-loading.
- A new cache added before the query and index were fixed.
