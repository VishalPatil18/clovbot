-- Reverses 016_feedback.sql. This loses the feedback already given, which is not
-- recoverable, so it is a deliberate act rather than a casual rollback.

drop view if exists feedback_report;
drop index if exists turns_feedback;

alter table turns drop constraint if exists turns_feedback_reason_check;
alter table turns drop column if exists feedback_at;
alter table turns drop column if exists feedback_reason;
alter table turns drop column if exists answer;
