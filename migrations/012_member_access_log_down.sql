-- Reverses 012_member_access_log.sql. FR-P3-09's rule applies to every
-- migration in this phase, not only the first.

drop policy if exists member_access_log_own_insert on member_access_log;
drop policy if exists member_access_log_own_row on member_access_log;
alter table member_access_log no force row level security;
alter table member_access_log disable row level security;

revoke all on member_access_log from clovbot_app;
revoke all on sequence member_access_log_id_seq from clovbot_app;

-- The log itself is left in place. Dropping an audit trail is a separate,
-- deliberate act and never a side effect of rolling back a schema change:
--   drop table member_access_log;
