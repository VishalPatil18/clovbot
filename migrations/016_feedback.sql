-- Makes "Did this answer your question?" worth asking. The rating was already
-- recorded; what a no needs is the answer it rated and the reason behind it.

-- ---------------------------------------------------------------------------
-- The answer, for public turns only.
--
-- A member's answer holds their record, and this table has no row-level security,
-- so storing it would be a durable unprotected copy. The writer leaves it null
-- for any turn carrying a member id.
-- ---------------------------------------------------------------------------

alter table turns add column if not exists answer text;

-- ---------------------------------------------------------------------------
-- Why the member said no. Four fixed reasons, never free text: redaction catches
-- a member id, not "my doctor said I have diabetes".
-- ---------------------------------------------------------------------------

alter table turns add column if not exists feedback_reason text;
alter table turns drop constraint if exists turns_feedback_reason_check;
alter table turns add constraint turns_feedback_reason_check
  check (feedback_reason is null or feedback_reason in (
    'wrong_plan',
    'not_what_i_asked',
    'hard_to_understand',
    'think_it_is_covered'
  ));

alter table turns add column if not exists feedback_at timestamptz;

create index if not exists turns_feedback on turns (member_feedback, feedback_at desc)
  where member_feedback is not null;

-- ---------------------------------------------------------------------------
-- What analysis reads. The session id stays on the turn for the loop breaker but
-- is excluded here, which makes the surface blind to it without calling the
-- store anonymous: it is pseudonymous.
-- ---------------------------------------------------------------------------

create or replace view feedback_report as
  select
    id,
    asked_at,
    question,
    answer,
    plan_context,
    route,
    outcome,
    refusal_trigger,
    member_feedback,
    feedback_reason,
    feedback_at
  from turns
  where member_feedback is not null;

grant select on feedback_report to clovbot_app;
