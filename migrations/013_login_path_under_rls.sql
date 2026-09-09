-- Repairs sign-in under the policies added by 011. Found by manual verification,
-- not by a failing test, which is why the check now covers this path too.
--
-- 011 exempted login_codes and member_sessions because they are read before an
-- identity exists. It missed that both paths then read `members`, which is
-- behind a policy: the email lookup that starts a sign-in returned nothing, so
-- no code could be issued, and the session lookup returned nothing, so nobody
-- was ever signed in.
--
-- The session lookup needs no help here: it holds a member id and can set the
-- identity before reading the row, which is what the exemption was for. The
-- email lookup has nothing to set an identity from, so it gets a function
-- narrow enough to be safe: one email in, at most one id out, nothing else.

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
