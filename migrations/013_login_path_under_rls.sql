-- Repairs sign-in, which 011 broke. It exempted login_codes and member_sessions
-- but missed that both paths then read `members`, which is behind a policy.
--
-- The session lookup holds a member id and can set the identity first. The email
-- lookup cannot, so it gets a function narrow enough to be safe: one email in,
-- at most one id out.

create or replace function member_for_login(p_email text)
returns table (id integer, email text)
language sql
stable
security definer
-- Pinned, because a definer function that resolves names through the caller's
-- search_path runs whatever the caller put there first.
set search_path = public, pg_temp
as $$
  select m.id, m.email from members m where lower(m.email) = lower(btrim(p_email))
$$;

revoke all on function member_for_login(text) from public;
grant execute on function member_for_login(text) to clovbot_app;

comment on function member_for_login(text) is
  'Pre-identity lookup for sign-in. Returns an id and the address that matched, and nothing else: no name, no plan, no record. An unknown address returns no rows, which is the same answer the endpoint gives either way. FR-P3-07, D-085.';
