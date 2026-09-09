-- Every read of a member's record, recorded. FR-P3-17 to FR-P3-23.
--
-- Names columns and the rows they came from, never their contents. A claim id
-- locates a row; a claim amount is the thing being protected, and putting it
-- here would make the audit trail a second copy of the data it audits. D-092.
--
-- Append-only from the application, by grant rather than by convention: the
-- role holds insert and select and nothing else, so a code path that tried to
-- rewrite history would be refused by the database. FR-P3-21.

create table if not exists member_access_log (
  id           bigserial   primary key,
  member_id    integer     not null references members (id) on delete cascade,
  -- Null when the read happened at a terminal rather than in a session.
  session_id   uuid        references member_sessions (id) on delete set null,
  read_at      timestamptz not null default now(),
  -- Which rule decided the record was needed. Null when nothing was read.
  topic        text,
  -- Redacted before it is written, exactly as turns.question is. FR-P3-23.
  question     text        not null,
  -- 'member_claims.member_owes@CLM-0031'. Empty when the turn read nothing.
  fields_read  text[]      not null default '{}',
  outcome      text        not null
);

create index if not exists member_access_log_by_member
  on member_access_log (member_id, read_at desc);

create index if not exists member_access_log_by_session
  on member_access_log (session_id, read_at desc);

grant select, insert on member_access_log to clovbot_app;
grant usage, select on sequence member_access_log_id_seq to clovbot_app;

-- A member reads their own access history and no one else's, on the same
-- identity the record policies use.
alter table member_access_log enable row level security;
alter table member_access_log force row level security;
drop policy if exists member_access_log_own_row on member_access_log;
create policy member_access_log_own_row on member_access_log
  for select to clovbot_app
  using (member_id = current_member_id());

-- The insert has to be allowed for the member the row is about, and the
-- application only ever writes rows about the member it just read.
drop policy if exists member_access_log_own_insert on member_access_log;
create policy member_access_log_own_insert on member_access_log
  for insert to clovbot_app
  with check (member_id = current_member_id());
