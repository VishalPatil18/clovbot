-- Reverses 011_row_level_security.sql. Order matters: drop the policies before
-- the function they call, and revoke last so the role can be dropped.

drop policy if exists members_own_row on members;
drop policy if exists member_accumulators_own_row on member_accumulators;
drop policy if exists member_claims_own_row on member_claims;
drop policy if exists member_prior_authorizations_own_row on member_prior_authorizations;
drop policy if exists member_appointments_own_row on member_appointments;

alter table members no force row level security;
alter table members disable row level security;
alter table member_accumulators no force row level security;
alter table member_accumulators disable row level security;
alter table member_claims no force row level security;
alter table member_claims disable row level security;
alter table member_prior_authorizations no force row level security;
alter table member_prior_authorizations disable row level security;
alter table member_appointments no force row level security;
alter table member_appointments disable row level security;

drop function if exists current_member_id();

comment on table login_codes is null;
comment on table member_sessions is null;

revoke all on chunks, drugs, corpus_snapshots, members, member_accumulators,
              member_claims, member_prior_authorizations, member_appointments,
              turns, callbacks, login_codes, member_sessions, rate_events
  from clovbot_app;
revoke all on sequence login_codes_id_seq, rate_events_id_seq from clovbot_app;
revoke all on function
  search_hybrid(vector, text, text, text, integer, integer, integer, text) from clovbot_app;
revoke all on function rate_check(text, integer, interval) from clovbot_app;
revoke usage on schema public from clovbot_app;

-- The role itself is left in place. Dropping it is a separate, deliberate act:
--   drop role clovbot_app;
