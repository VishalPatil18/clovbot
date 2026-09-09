-- Member scoping moves from the application into the database. FR-P3-01 to FR-P3-12.
--
-- Until now the only thing keeping one member's record away from another was a
-- `where member_id = $1` in one function. A new code path that forgets it, or a
-- bug inside it, discloses a record and no layer objects.
--
-- Two halves. A role that cannot bypass the policies, and the policies.
--
-- The role must already exist. It is created by hand with a password that never
-- enters this repository:
--
--   create role clovbot_app login password '<operator chooses>' nobypassrls;
--
-- Run this file as the owning role. D-090.

-- ---------------------------------------------------------------------------
-- Privileges. Only what the running product actually executes.
-- ---------------------------------------------------------------------------

grant usage on schema public to clovbot_app;

-- The corpus. Read only: it is written by ingest, which connects as the admin.
grant select on chunks, drugs, corpus_snapshots to clovbot_app;

-- The member record. Read only, and every row behind a policy below.
grant select on members, member_accumulators, member_claims,
                member_prior_authorizations, member_appointments to clovbot_app;

-- Operational tables the running product writes. No delete anywhere: nothing in
-- the product removes a turn, a callback or a session.
grant select, insert, update on turns to clovbot_app;
grant insert on callbacks to clovbot_app;
grant select, insert, update on login_codes, member_sessions to clovbot_app;

-- rate_check prunes rows older than a day as the calling role, so the delete
-- belongs to the function rather than to a data path. Rate events hold no
-- member data, which is why granting it here costs nothing.
grant select, insert, delete on rate_events to clovbot_app;

grant usage, select on sequence login_codes_id_seq, rate_events_id_seq to clovbot_app;

grant execute on function
  search_hybrid(vector, text, text, text, integer, integer, integer, text) to clovbot_app;
grant execute on function rate_check(text, integer, interval) to clovbot_app;

-- ---------------------------------------------------------------------------
-- Policies. FORCE as well as ENABLE: without it the owning role reads every row
-- and a policy that the owner silently bypasses is not a control.
--
-- The identity is read from a setting carried on the connection, which the
-- application sets transaction-locally from the session row and from nowhere
-- else. `current_setting(..., true)` yields NULL when nothing set it, and
-- `member_id = NULL` is never true, so an unidentified connection reads zero
-- rows rather than every row. FR-P3-06.
-- ---------------------------------------------------------------------------

create or replace function current_member_id() returns integer
language sql stable
as $$ select nullif(current_setting('clovbot.member_id', true), '')::integer $$;

grant execute on function current_member_id() to clovbot_app;

alter table members enable row level security;
alter table members force row level security;
drop policy if exists members_own_row on members;
create policy members_own_row on members
  for select to clovbot_app
  using (id = current_member_id());

alter table member_accumulators enable row level security;
alter table member_accumulators force row level security;
drop policy if exists member_accumulators_own_row on member_accumulators;
create policy member_accumulators_own_row on member_accumulators
  for select to clovbot_app
  using (member_id = current_member_id());

alter table member_claims enable row level security;
alter table member_claims force row level security;
drop policy if exists member_claims_own_row on member_claims;
create policy member_claims_own_row on member_claims
  for select to clovbot_app
  using (member_id = current_member_id());

alter table member_prior_authorizations enable row level security;
alter table member_prior_authorizations force row level security;
drop policy if exists member_prior_authorizations_own_row on member_prior_authorizations;
create policy member_prior_authorizations_own_row on member_prior_authorizations
  for select to clovbot_app
  using (member_id = current_member_id());

alter table member_appointments enable row level security;
alter table member_appointments force row level security;
drop policy if exists member_appointments_own_row on member_appointments;
create policy member_appointments_own_row on member_appointments
  for select to clovbot_app
  using (member_id = current_member_id());

-- ---------------------------------------------------------------------------
-- login_codes and member_sessions carry a member_id and deliberately get no
-- policy. The sign-in path reads them to discover who the member is, before any
-- identity exists to filter by, so a policy keyed on that identity would lock
-- out the only path that can establish it.
--
-- They are protected by privilege instead: the grants above are the only ones,
-- so no role but the application and the admin can read them at all. The schema
-- check asserts this exemption by name, so it stays a decision. FR-P3-07.
-- ---------------------------------------------------------------------------

comment on table login_codes is
  'RLS-exempt by design: read before an identity exists, during sign-in. Protected by grant. FR-P3-07.';
comment on table member_sessions is
  'RLS-exempt by design: this table is what establishes the identity policies filter by. Protected by grant. FR-P3-07.';
