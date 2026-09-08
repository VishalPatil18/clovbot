-- Stage 10: release. FR-27 feedback, and the index the instrumentation reads.

-- FR-27. The control existed from Stage 7 but recorded nothing; this is where
-- the answer actually lands. Nullable on turns rather than a separate table,
-- because a response belongs to exactly one turn.
alter table turns add column if not exists member_feedback text
  check (member_feedback in ('resolved', 'not_resolved'));

-- The instrumentation reads by outcome and by trigger, over a time window.
create index if not exists turns_outcome on turns (outcome, asked_at desc);
create index if not exists turns_trigger on turns (refusal_trigger, asked_at desc)
  where refusal_trigger is not null;
