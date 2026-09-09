-- Makes "Did this answer your question?" worth asking. FR-P3-63 to FR-P3-69.
--
-- The control already recorded a yes or a no against the turn. What was missing
-- is everything that makes a no actionable: what the assistant actually said,
-- and why the member thought it was wrong.

-- ---------------------------------------------------------------------------
-- The answer, for public turns only.
--
-- A signed-in member's answer contains their own record: a claim amount, a
-- prior-authorisation status, a provider's name. Storing it here would be a
-- durable copy of member data in a table with no row-level security, which is
-- what P3 Stage 2 spent its time removing. The writer leaves this null for any
-- turn carrying a member id, and the check below makes that a rule rather than
-- a habit. D-102.
-- ---------------------------------------------------------------------------

alter table turns add column if not exists answer text;

-- ---------------------------------------------------------------------------
-- Why the member said no. Four fixed reasons, never free text.
--
-- Free text is the one surface that could put a diagnosis into this database.
-- Identifier redaction catches a member id or a date of birth; it does not
-- catch "my doctor said I have diabetes". Fixed reasons are also faster to
-- answer than a text box for an audience that finds typing hard.
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
-- What analysis reads.
--
-- The session id stays on the turn because the loop breaker counts consecutive
-- refusals within one, but it links every question in a visit and nothing in a
-- feedback report needs it. Reading through this view is what lets the
-- documentation call the analysis surface blind to it without claiming the
-- store itself is anonymous, which it is not: it is pseudonymous. D-102.
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
