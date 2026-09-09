-- Reverses 012_member_access_log.sql. The same rule applies to every
-- migration here, not only the first.

drop policy if exists member_access_log_own_insert on member_access_log;
drop policy if exists member_access_log_own_row on member_access_log;
alter table member_access_log no force row level security;
alter table member_access_log disable row level security;

revoke all on member_access_log from clovbot_app;
revoke all on sequence member_access_log_id_seq from clovbot_app;

-- The log is left in place: dropping an audit trail is never a side effect.
--   drop table member_access_log;
