-- Five synthetic members, so the two call drivers that need identity - a claim
-- and a prior authorisation - become answerable. FR-P2-24 to FR-P2-29.
--
-- D-047: no real member data enters this system at any version. The synthetic
-- column is a constraint, not a comment: a row that claims to be real cannot be
-- inserted. Row-level security is P3; scoping here is enforced in the query.

create table if not exists members (
  id               integer primary key,
  synthetic        boolean not null default true check (synthetic),
  display_name     text    not null,
  email            text    not null unique,
  contract_id      text    not null,
  plan_id          text    not null,
  plan_year        integer not null,
  effective_date   date    not null,
  assigned_provider     text not null,
  assigned_specialty    text not null,
  -- Part D thresholds differ by plan, read from that plan's Evidence of
  -- Coverage, so the stage is derived per member rather than per system. D-081.
  drug_deductible       numeric(10,2) not null,
  out_of_pocket_limit   numeric(10,2) not null
);

create table if not exists member_accumulators (
  member_id            integer primary key references members (id) on delete cascade,
  oop_max_limit        numeric(10,2) not null,
  oop_max_used_ytd     numeric(10,2) not null,
  drug_spend_ytd       numeric(10,2) not null,
  dental_limit         numeric(10,2) not null,
  dental_remaining     numeric(10,2) not null,
  otc_limit            numeric(10,2) not null,
  otc_remaining        numeric(10,2) not null,
  hearing_limit        numeric(10,2) not null,
  hearing_remaining    numeric(10,2) not null,
  vision_limit         numeric(10,2) not null,
  vision_remaining     numeric(10,2) not null
);

create table if not exists member_claims (
  id                  text primary key,
  member_id           integer not null references members (id) on delete cascade,
  service_date        date    not null,
  provider            text    not null,
  service_description text    not null,
  billed              numeric(10,2) not null,
  plan_paid           numeric(10,2) not null,
  member_owes         numeric(10,2) not null,
  status              text    not null check (status in ('received','processing','paid','denied'))
);

create table if not exists member_prior_authorizations (
  id                text primary key,
  member_id         integer not null references members (id) on delete cascade,
  requested_service text    not null,
  requested_date    date    not null,
  status            text    not null check (status in ('submitted','in_review','approved','denied')),
  decision_date     date
);

create table if not exists member_appointments (
  id          text primary key,
  member_id   integer not null references members (id) on delete cascade,
  visit_date  date    not null,
  provider    text    not null,
  specialty   text    not null
);

create index if not exists member_claims_by_member on member_claims (member_id, service_date desc);
create index if not exists member_pa_by_member on member_prior_authorizations (member_id, requested_date desc);
create index if not exists member_appointments_by_member on member_appointments (member_id, visit_date desc);
