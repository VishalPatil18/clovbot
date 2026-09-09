-- Three caches, one store. FR-P3-53 to FR-P3-60.
--
-- Postgres rather than memory or disk because the service runs on Cloud Run:
-- an in-process cache dies with the instance and is not shared between them,
-- and the audio cache's disk directory has the same two problems. A cache whose
-- hit rate collapses on every deploy is a benchmark, not a feature.
--
-- None of these tables holds member data. A turn carrying a member id is never
-- cached, so there is nothing here to put behind a policy, and the schema check
-- is satisfied because no table carries a member_id column.

-- ---------------------------------------------------------------------------
-- Answers. Keyed on the exact normalised question inside its scope.
--
-- Not on similarity. Two questions can be one word apart and have different
-- amounts: "what is my specialist copay" is $10 and the out-of-network form is
-- $20. `docs/ideas.md` P4-01 names that collision as the reason the threshold
-- would have to be high; keying on the question itself removes the question.
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
-- Synthesised audio. Moved off the container filesystem for the reason above.
-- The provider and voice stay in the key: the same words in another voice are a
-- different recording, and serving yesterday's voice after the chain degraded
-- would be a silent inconsistency.
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
