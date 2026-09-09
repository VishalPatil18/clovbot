-- Three caches, one store.
--
-- Postgres, not memory or disk: on Cloud Run an in-process cache dies with the
-- instance and is shared with nothing. A hit rate that collapses on every deploy
-- is a benchmark, not a feature.
--
-- No table here holds member data, because a member's turn is never cached.

-- ---------------------------------------------------------------------------
-- Answers, keyed on the exact normalised question inside its scope, never on
-- similarity: "specialist copay" is $10 and the out-of-network form is $20.
-- ---------------------------------------------------------------------------

create table if not exists answer_cache (
  -- sha256 over snapshot, contract, plan, year, language and the normalised question.
  key           text        primary key,
  snapshot_id   text        not null,
  contract_id   text        not null,
  plan_id       text        not null,
  plan_year     integer     not null,
  language      text        not null,
  -- Kept readable so a cached answer can be inspected without replaying the hash.
  question      text        not null,
  -- The whole turn: answer, claims, retrieved chunks, citations, route.
  turn          jsonb       not null,
  created_at    timestamptz not null default now(),
  last_hit_at   timestamptz,
  hits          integer     not null default 0
);

create index if not exists answer_cache_snapshot on answer_cache (snapshot_id);

-- ---------------------------------------------------------------------------
-- Query embeddings. Keyed on the text and the model, so a redeployment onto a
-- different embedding model cannot serve vectors from the old one.
-- ---------------------------------------------------------------------------

create table if not exists embedding_cache (
  key         text         primary key,
  model       text         not null,
  embedding   vector(1536) not null,
  created_at  timestamptz  not null default now(),
  last_hit_at timestamptz,
  hits        integer      not null default 0
);

-- ---------------------------------------------------------------------------
-- Synthesised audio, off the container filesystem for the reason above. Provider
-- and voice stay in the key: the same words in another voice are another recording.
-- ---------------------------------------------------------------------------

create table if not exists audio_cache (
  key         text        primary key,
  provider    text        not null,
  voice       text        not null,
  audio       bytea       not null,
  bytes       integer     not null,
  created_at  timestamptz not null default now(),
  last_hit_at timestamptz,
  hits        integer     not null default 0
);

grant select, insert, update on answer_cache, embedding_cache, audio_cache to clovbot_app;
