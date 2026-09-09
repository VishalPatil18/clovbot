-- Reverses 013_login_path_under_rls.sql. Sign-in stops working while this is
-- reversed and 011 is still applied, which is the state 013 exists to repair.

drop function if exists member_for_login(text);
