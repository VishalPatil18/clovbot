-- Two dates, not one: a member asks whether the documents are current, an
-- operator whether the index is. The manifest holding the fetch date is under
-- data/, absent from the container, so the server cannot read it at query time.

create table if not exists corpus_snapshots (
  snapshot_id          text primary key,
  documents_fetched_at timestamptz not null,
  ingested_at          timestamptz not null default now(),
  plan_year            integer     not null
);
