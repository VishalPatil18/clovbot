-- Typed formulary rows, and the router's decision on each turn.
--
-- D-007 wants a table query for a fact that lives in a table. Semantic search over
-- a prose rendering of the drug list loses the precision the table already has.
-- D-060 puts these rows in their own table rather than in chunks, whose shape
-- exists for embedding and retrieval.
--
-- Tier is one column for all seven New Jersey plans the formulary names, so a row
-- is contract-wide in the same sense its chunks are. D-056.

create table if not exists drugs (
  snapshot_id      text    not null,
  document_id      text    not null,
  normalized_name  text    not null,
  name             text    not null,
  category         text    not null,
  tier             integer not null check (tier between 1 and 5),
  requirements     text    not null default '',
  plan_year        integer not null,
  primary key (snapshot_id, normalized_name, name)
);

-- Lookup is by the name a member types, within the current snapshot.
create index if not exists drugs_lookup on drugs (snapshot_id, normalized_name);

-- FR-P2-09. The route and why it was chosen, so Stage 8 can report accuracy from
-- the record rather than from stdout. D-063.
alter table turns add column if not exists route        text;
alter table turns add column if not exists route_reason text;
