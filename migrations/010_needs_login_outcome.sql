-- A gated question is a fourth outcome, and the constraint predates it. The
-- answer streams before the turn is written, so a rejected insert replaced a
-- delivered sign-in card with an error the member could do nothing about.

alter table turns drop constraint if exists turns_outcome_check;

alter table turns add constraint turns_outcome_check
  check (outcome in ('answered', 'refused', 'upstream_failure', 'needs_login'));
