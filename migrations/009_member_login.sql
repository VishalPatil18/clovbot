-- Email one-time codes and the sessions they create. FR-P2-30 to FR-P2-41.
--
-- No code is ever stored. Only a scrypt hash and its salt, because a six-digit
-- code is a live credential with a million possibilities: a fast hash, or the
-- code itself, would fall to an offline sweep the moment this table leaked.
--
-- Row-level security is P3-01. Until then, scoping is enforced in the query and
-- a session is the only thing that makes member data reachable at all.

create table if not exists login_codes (
  id           bigserial primary key,
  email        text        not null,
  member_id    integer     not null references members (id) on delete cascade,
  code_hash    text        not null,
  salt         text        not null,
  issued_at    timestamptz not null default now(),
  attempts     integer     not null default 0,
  consumed_at  timestamptz
);

create index if not exists login_codes_lookup on login_codes (email, issued_at desc);

create table if not exists member_sessions (
  -- The cookie carries a random id; the row is the authority on who it is.
  id           uuid        primary key,
  member_id    integer     not null references members (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at     timestamptz
);

create index if not exists member_sessions_by_member on member_sessions (member_id, created_at desc);
