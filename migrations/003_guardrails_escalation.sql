-- Stage 8: escalation and rate limiting. FR-22, FR-30, NFR-SEC-02.

-- FR-26's turn record specifies session_id; Stage 3 omitted it. The loop breaker
-- reads consecutive refusals from here, so it survives a server restart.
alter table turns add column if not exists session_id text;
alter table turns add column if not exists refusal_trigger text;
create index if not exists turns_session on turns (session_id, asked_at desc);

-- A refusal offers a callback pre-filled with what the assistant already knows,
-- so the member does not restate their question to a person. FR-22.
-- No message is sent anywhere: the form validates, stores and confirms.
create table if not exists callbacks (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  -- Redacted before insert per FR-31, same as turns.question.
  question           text        not null,
  plan_context       text,
  documents_searched text[]      not null default '{}',
  refusal_trigger    text,
  -- Free text the member adds. Redacted on the same path.
  note               text,
  -- Deliberately no name, email or phone: NFR-SEC-01 holds no member identity,
  -- and a case study must not collect contact details it cannot protect.
  session_id         text        not null
);

create index if not exists callbacks_created_at on callbacks (created_at desc);

-- Per-session and per-IP limits. FR-30, NFR-SEC-02. In Postgres rather than in
-- memory so the count survives a restart and is auditable.
create table if not exists rate_events (
  id         bigserial primary key,
  bucket_key text        not null,
  occurred_at timestamptz not null default now()
);

create index if not exists rate_events_lookup on rate_events (bucket_key, occurred_at desc);

-- Counts within a window, and prunes what has aged out so the table stays small.
create or replace function rate_check(
  p_key      text,
  p_limit    integer,
  p_window   interval
)
returns table (allowed boolean, used integer, remaining integer)
language plpgsql
as $$
declare
  v_used integer;
begin
  delete from rate_events where occurred_at < now() - interval '24 hours';

  select count(*) into v_used
    from rate_events
   where bucket_key = p_key
     and occurred_at > now() - p_window;

  if v_used >= p_limit then
    return query select false, v_used, 0;
  end if;

  insert into rate_events (bucket_key) values (p_key);
  return query select true, v_used + 1, p_limit - v_used - 1;
end;
$$;
