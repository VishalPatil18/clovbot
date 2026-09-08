---
name: spec-db-design
description: Design and review the database schema - tables, relationships, constraints, indexes, and migrations - for data integrity and performance. Use when modeling data, adding tables/columns, choosing keys or indexes, planning a migration, or when the user says "database schema", "data model", "add a table", "review the schema", or invokes `/spec-db-design`. Reads the SRS entities first; enforces integrity in the schema, not the app; treats every migration as reversible.
---

# spec-db-design

Design the data model and review existing schema. The database is the longest-lived, hardest-to-change layer - a bad column outlives three rewrites of the code above it. Design for integrity first, performance second, convenience last.

Two modes: **design** (new schema/tables) and **review** (audit an existing schema). Default to design unless the request is an audit.

---

## Read first

- `claude/srs.md` - the entities, their attributes, and the invariants the data must uphold.
- `claude/context.md` **Current State** - the DB engine, ORM/migration tool, and existing tables.
- The migration directory and existing schema files named by the request. Nothing else.

## Design method

### Step 1 - Model the entities and their invariants

From the SRS, list entities, attributes, and the rules that must always hold ("an order always has a customer", "email is unique per tenant"). Each invariant becomes a constraint, not a comment.

### Step 2 - Enforce integrity in the schema

- **Primary keys** on every table. Prefer a surrogate key (`id`) plus a unique constraint on the natural key.
- **Foreign keys** with explicit `ON DELETE` behavior - never leave referential integrity to application code.
- **NOT NULL** by default; nullable is a deliberate decision, not an oversight.
- **CHECK / UNIQUE constraints** for every invariant the type system cannot express (status enums, non-negative amounts, per-tenant uniqueness).
- **Money is never a float.** Use decimal/numeric with explicit precision, or integer minor units.

### Step 3 - Normalize, then denormalize only with evidence

Start at 3NF: no repeating groups, no partial or transitive dependencies. Denormalize a specific read path only when a measured query proves it necessary - and then name the invalidation story for the duplicated data.

### Step 4 - Index for the real query shapes

- Index the columns that appear in `WHERE`, `JOIN`, and `ORDER BY` on hot paths.
- Composite indexes lead with equality columns; in multi-tenant schemas, tenant id comes first.
- Do not index blindly - every index costs write throughput and storage. Index the queries you actually run.

## Migration discipline (never skip)

- **Every migration is reversible.** Write the down path, or document why rollback is impossible before shipping.
- **Additive first.** Add nullable column -> backfill -> add constraint -> switch code -> drop old column, across separate migrations. Never rename-and-hope in one step on a live table.
- **Large-table changes** (adding an index or NOT NULL to millions of rows) lock or degrade - plan for online/concurrent operations and off-peak timing.
- A migration that has run in any shared environment is immutable; correct it with a new migration.

## Review checklist (for an existing schema)

- [ ] Every table has a primary key; every relationship has a foreign key with defined delete behavior.
- [ ] Invariants are constraints (UNIQUE/CHECK/NOT NULL), not application-only checks.
- [ ] No money in floats; timestamps are timezone-aware.
- [ ] Hot-path queries have supporting indexes; no unused/duplicate indexes bloating writes.
- [ ] No N+1-inviting shapes (missing join keys, unindexed foreign keys).
- [ ] Migrations are reversible and additive; no destructive one-step column renames.

## Output and memory update

1. Present the schema (DDL or ORM models) and the migration plan, ordered and reversible.
2. Report review findings as: _object -> problem -> data-integrity or performance consequence_, ranked by severity.
3. Update `claude/context.md` **Current State** (data model) and `claude/design-decisions.md` for any non-obvious modeling choice (surrogate vs natural key, denormalization).

## Red flags

- Referential integrity enforced only in application code.
- A nullable column with no reason, or a status stored as free-text instead of a constrained enum.
- Indexes added "just in case"; or a hot query with a sequential scan on a large table.
- An irreversible or non-additive migration on a table that already holds data.
