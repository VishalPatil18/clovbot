-- Email one-time codes and the sessions they create.
--
-- No code is ever stored, only a scrypt hash and its salt: a six-digit code has
-- a million possibilities and a fast hash would fall to an offline sweep.

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
