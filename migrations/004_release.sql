-- Feedback, and the index the instrumentation reads.

-- Nullable on turns rather than a separate table: a response belongs to one turn.
alter table turns add column if not exists member_feedback text
  check (member_feedback in ('resolved', 'not_resolved'));

-- The instrumentation reads by outcome and by trigger, over a time window.
create index if not exists turns_outcome on turns (outcome, asked_at desc);
create index if not exists turns_trigger on turns (refusal_trigger, asked_at desc)
  where refusal_trigger is not null;
