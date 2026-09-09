-- Typed formulary rows, and the router's decision on each turn.
--
-- A fact that lives in a table wants a table query: semantic search over a prose
-- rendering loses the precision the table already has. Tier is one column for all
-- seven plans the formulary names, so a row is contract-wide like its chunks.

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

-- The route and why it was chosen, so accuracy is reported from the record.
alter table turns add column if not exists route        text;
alter table turns add column if not exists route_reason text;
