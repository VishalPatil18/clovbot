-- When the plan documents were fetched, and when they were indexed.
--
-- Two different dates. A member asking whether an answer is current is asking
-- about the documents; an operator asking whether the index is fresh is asking
-- about the ingest. FR-P2-16, D-066.
--
-- The manifest that holds the fetch date lives under data/, which is gitignored
-- and absent from the container, so the server cannot read it at query time.

create table if not exists corpus_snapshots (
  snapshot_id          text primary key,
  documents_fetched_at timestamptz not null,
  ingested_at          timestamptz not null default now(),
  plan_year            integer     not null
);
