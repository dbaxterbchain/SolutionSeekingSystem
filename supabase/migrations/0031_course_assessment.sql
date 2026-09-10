-- The final assessment: attempts, responses, grading jobs, grades, certificates
-- and review requests. Same rules as 0030: RLS on, no policies, grants to
-- service_role only, every sequence revoked from the client roles. State that
-- must change atomically changes inside one of the functions at the bottom;
-- the API and the worker never write these tables directly except for the
-- per-prompt save (a single compare-and-set update) and the stage lock.

create table if not exists public.course_source_packs (
  id          uuid primary key default gen_random_uuid(),
  sha256      text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  kind        text not null default 'methodology' check (kind in ('methodology')),
  body        text not null,
  char_count  integer not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.course_assessment_attempts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  course_id              text not null,
  form_id                text not null,
  form_version           integer not null,
  certification_version  text not null,
  rubric_version         text not null,
  prompt_version         text not null,
  source_pack_id         uuid not null references public.course_source_packs (id),
  state                  text not null default 'draft'
                         check (state in ('draft', 'submitted', 'grading', 'passed', 'needs_revision', 'grading_error')),
  current_stage          integer not null default 0,
  stage_count            integer not null check (stage_count >= 1),
  -- Frozen at start. The public half is what the learner may see, stage by
  -- stage; the private half (reference responses, coverage map, anchors) is
  -- selected only by the grading worker and the admin route.
  snapshot_public        jsonb not null,
  snapshot_private       jsonb not null,
  submitted_at           timestamptz,
  submit_request_key     text,
  submission_hash        text,
  grade_id               uuid,                       -- FK added below, after course_grades
  finalized_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
-- One open attempt per learner per course. History is every other row.
create unique index if not exists course_assessment_attempts_open_idx
  on public.course_assessment_attempts (user_id, course_id)
  where state in ('draft', 'submitted', 'grading', 'grading_error');
create index if not exists course_assessment_attempts_user_idx
  on public.course_assessment_attempts (user_id, course_id, created_at desc);
create index if not exists course_assessment_attempts_source_pack_idx
  on public.course_assessment_attempts (source_pack_id);

create table if not exists public.course_assessment_responses (
  attempt_id     uuid not null references public.course_assessment_attempts (id) on delete cascade,
  prompt_id      text not null,
  stage          integer not null,
  response_text  text not null default '' check (char_length(response_text) <= 8000),
  revision       integer not null default 0,
  locked_at      timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (attempt_id, prompt_id)
);

create table if not exists public.course_grading_jobs (
  id                    uuid primary key default gen_random_uuid(),
  attempt_id            uuid not null references public.course_assessment_attempts (id) on delete cascade,
  generation            integer not null default 1,
  state                 text not null default 'queued' check (state in ('queued', 'running', 'succeeded', 'failed')),
  reason                text not null default 'submission' check (reason in ('submission', 'retry', 'regrade')),
  requested_by          uuid references auth.users (id) on delete set null,
  attempts              integer not null default 0,
  max_attempts          integer not null default 3,
  locked_by             text,
  locked_at             timestamptz,
  lock_token            uuid,
  last_error            text,
  error_category        text check (error_category in (
                          'rate_limited', 'overloaded', 'upstream', 'invalid_output',
                          'refusal', 'max_tokens', 'integrity', 'internal')),
  model                 text,
  prompt_version        text,
  raw_output            text,
  usage                 jsonb,
  validated             jsonb,
  decision              jsonb,
  result_email_sent_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (attempt_id, generation)
);
create unique index if not exists course_grading_jobs_active_idx
  on public.course_grading_jobs (attempt_id) where state in ('queued', 'running');
create index if not exists course_grading_jobs_state_idx
  on public.course_grading_jobs (state, updated_at);
create index if not exists course_grading_jobs_requested_by_idx
  on public.course_grading_jobs (requested_by) where requested_by is not null;

create table if not exists public.course_grades (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references public.course_assessment_attempts (id) on delete cascade,
  generation      integer not null,
  job_id          uuid references public.course_grading_jobs (id) on delete set null,
  source          text not null default 'model' check (source in ('model', 'review')),
  rubric_version  text not null,
  model           text,
  prompt_version  text,
  criteria        jsonb not null,
  coverage        jsonb not null,
  misconceptions  jsonb not null default '[]'::jsonb,
  caps_applied    jsonb not null default '[]'::jsonb,
  total           numeric(6,3) not null,
  passed          boolean not null,
  decision        jsonb not null,
  created_at      timestamptz not null default now(),
  unique (attempt_id, generation)
);
create index if not exists course_grades_job_idx on public.course_grades (job_id) where job_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'course_assessment_attempts_grade_fk'
  ) then
    alter table public.course_assessment_attempts
      add constraint course_assessment_attempts_grade_fk
      foreign key (grade_id) references public.course_grades (id) on delete set null;
  end if;
end $$;
create index if not exists course_assessment_attempts_grade_idx
  on public.course_assessment_attempts (grade_id) where grade_id is not null;

create sequence if not exists public.course_certificate_serial_seq;

create table if not exists public.course_certificates (
  id                     uuid primary key default gen_random_uuid(),
  serial                 text not null unique,
  user_id                uuid not null references auth.users (id) on delete cascade,
  certification_version  text not null,
  attempt_id             uuid references public.course_assessment_attempts (id) on delete set null,
  display_name           text,
  name_confirmed_at      timestamptz,
  issued_at              timestamptz not null default now(),
  status                 text not null default 'active' check (status in ('active', 'revoked')),
  revoked_at             timestamptz,
  revoke_reason          text,
  share_token            text unique,
  share_active           boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, certification_version)
);
create index if not exists course_certificates_attempt_idx
  on public.course_certificates (attempt_id) where attempt_id is not null;

create table if not exists public.course_review_requests (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.course_assessment_attempts (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  grade_id            uuid references public.course_grades (id) on delete set null,
  criterion_id        text not null,
  reason              text not null check (char_length(reason) between 20 and 2000),
  state               text not null default 'open' check (state in ('open', 'resolved')),
  owner               text,
  resolution          text,
  original_scores     jsonb,
  corrected_scores    jsonb,
  certificate_action  text not null default 'none' check (certificate_action in ('none', 'issue', 'revoke')),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists course_review_requests_open_idx
  on public.course_review_requests (attempt_id) where state = 'open';
create index if not exists course_review_requests_user_idx on public.course_review_requests (user_id);
create index if not exists course_review_requests_grade_idx
  on public.course_review_requests (grade_id) where grade_id is not null;

-- updated_at triggers (set_updated_at exists since 0001).
drop trigger if exists course_assessment_attempts_set_updated_at on public.course_assessment_attempts;
create trigger course_assessment_attempts_set_updated_at
  before update on public.course_assessment_attempts
  for each row execute function public.set_updated_at();
drop trigger if exists course_assessment_responses_set_updated_at on public.course_assessment_responses;
create trigger course_assessment_responses_set_updated_at
  before update on public.course_assessment_responses
  for each row execute function public.set_updated_at();
drop trigger if exists course_grading_jobs_set_updated_at on public.course_grading_jobs;
create trigger course_grading_jobs_set_updated_at
  before update on public.course_grading_jobs
  for each row execute function public.set_updated_at();
drop trigger if exists course_certificates_set_updated_at on public.course_certificates;
create trigger course_certificates_set_updated_at
  before update on public.course_certificates
  for each row execute function public.set_updated_at();
drop trigger if exists course_review_requests_set_updated_at on public.course_review_requests;
create trigger course_review_requests_set_updated_at
  before update on public.course_review_requests
  for each row execute function public.set_updated_at();

/*
 * Start an attempt: the attempt row and one empty response row per prompt in
 * one transaction. A concurrent second start lands on the partial unique
 * index and gets the existing open attempt back instead of an error.
 * p_prompts is [{ "prompt_id": "a1", "stage": 0 }, ...].
 */
create or replace function public.create_course_attempt(
  p_user uuid, p_course text, p_form_id text, p_form_version integer,
  p_certification_version text, p_rubric_version text, p_prompt_version text,
  p_source_pack uuid, p_stage_count integer, p_public jsonb, p_private jsonb, p_prompts jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_existing uuid;
begin
  select id into v_existing from public.course_assessment_attempts
    where user_id = p_user and course_id = p_course
      and state in ('draft', 'submitted', 'grading', 'grading_error')
    limit 1;
  if v_existing is not null then
    return jsonb_build_object('outcome', 'existing', 'attempt_id', v_existing);
  end if;
  begin
    insert into public.course_assessment_attempts
      (user_id, course_id, form_id, form_version, certification_version, rubric_version,
       prompt_version, source_pack_id, stage_count, snapshot_public, snapshot_private)
    values
      (p_user, p_course, p_form_id, p_form_version, p_certification_version, p_rubric_version,
       p_prompt_version, p_source_pack, p_stage_count, p_public, p_private)
    returning id into v_id;
  exception when unique_violation then
    select id into v_existing from public.course_assessment_attempts
      where user_id = p_user and course_id = p_course
        and state in ('draft', 'submitted', 'grading', 'grading_error')
      limit 1;
    return jsonb_build_object('outcome', 'existing', 'attempt_id', v_existing);
  end;
  insert into public.course_assessment_responses (attempt_id, prompt_id, stage)
    select v_id, p->>'prompt_id', (p->>'stage')::integer
    from jsonb_array_elements(p_prompts) as p;
  return jsonb_build_object('outcome', 'created', 'attempt_id', v_id);
end $$;

/*
 * Submit: draft -> submitted, every response locked, the generation-1 job
 * inserted, all in one transaction. The row lock serialises a double submit;
 * the second caller with the same request key gets the same job back.
 */
create or replace function public.submit_course_attempt(
  p_attempt uuid, p_user uuid, p_request_key text, p_hash text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt public.course_assessment_attempts%rowtype;
  v_job uuid;
begin
  select * into v_attempt from public.course_assessment_attempts
    where id = p_attempt and user_id = p_user for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found', 'job_id', null);
  end if;
  if v_attempt.state <> 'draft' then
    if v_attempt.submit_request_key = p_request_key then
      select id into v_job from public.course_grading_jobs
        where attempt_id = p_attempt order by generation desc limit 1;
      return jsonb_build_object('outcome', 'duplicate', 'job_id', v_job);
    end if;
    return jsonb_build_object('outcome', 'already_submitted', 'job_id', null);
  end if;
  update public.course_assessment_responses
    set locked_at = coalesce(locked_at, now()) where attempt_id = p_attempt;
  update public.course_assessment_attempts
    set state = 'submitted', submitted_at = now(), submit_request_key = p_request_key,
        submission_hash = p_hash, current_stage = stage_count - 1
    where id = p_attempt;
  insert into public.course_grading_jobs (attempt_id, generation, reason)
    values (p_attempt, 1, 'submission') returning id into v_job;
  return jsonb_build_object('outcome', 'created', 'job_id', v_job);
end $$;

/*
 * Claim: a worker takes the job for one lease. Queued jobs and running jobs
 * whose lease expired are claimable; a job another worker holds is skipped
 * (skip locked) rather than waited for. The retry cap is decided here, never
 * by a worker or the sweeper. The default lease of 840 seconds mirrors
 * DEFAULT_LEASE_SECONDS in gradingJob.ts: longer than the 720 seconds one
 * grade is allowed, shorter than the 900 second Netlify background limit.
 */
create or replace function public.claim_course_grading_job(
  p_job uuid, p_worker text, p_lease_seconds integer default 840
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_job public.course_grading_jobs%rowtype;
  v_token uuid;
begin
  select * into v_job from public.course_grading_jobs where id = p_job for update skip locked;
  if not found or v_job.state not in ('queued', 'running') then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if v_job.state = 'running' and v_job.locked_at is not null
     and v_job.locked_at > now() - make_interval(secs => p_lease_seconds) then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if v_job.attempts >= v_job.max_attempts then
    update public.course_grading_jobs
      set state = 'failed', locked_by = null, locked_at = null, lock_token = null,
          last_error = coalesce(last_error, 'retry budget exhausted')
      where id = p_job;
    update public.course_assessment_attempts set state = 'grading_error' where id = v_job.attempt_id;
    return jsonb_build_object('outcome', 'exhausted');
  end if;
  v_token := gen_random_uuid();
  update public.course_grading_jobs
    set state = 'running', attempts = attempts + 1, locked_by = p_worker,
        locked_at = now(), lock_token = v_token
    where id = p_job;
  update public.course_assessment_attempts set state = 'grading' where id = v_job.attempt_id;
  return jsonb_build_object(
    'outcome', 'claimed', 'lock_token', v_token, 'attempt_id', v_job.attempt_id,
    'generation', v_job.generation, 'attempts', v_job.attempts + 1);
end $$;

/*
 * Finalize: only the worker holding the current lock token may finish the
 * job. The grade insert is on-conflict-do-nothing, so a duplicate finalize
 * from a worker whose lease expired can never produce a second grade. The
 * certificate is issued only when the attempt passed and awards are enabled.
 */
create or replace function public.finalize_course_grade(
  p_job uuid, p_lock_token uuid, p_raw text, p_usage jsonb, p_validated jsonb, p_decision jsonb,
  p_model text, p_prompt_version text, p_rubric_version text, p_awards_enabled boolean
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_job public.course_grading_jobs%rowtype;
  v_attempt public.course_assessment_attempts%rowtype;
  v_grade uuid;
  v_passed boolean;
  v_total numeric(6,3);
  v_serial text;
begin
  select * into v_job from public.course_grading_jobs where id = p_job for update;
  if not found or v_job.state <> 'running' or v_job.lock_token is distinct from p_lock_token then
    return jsonb_build_object('outcome', 'stale');
  end if;
  select * into v_attempt from public.course_assessment_attempts where id = v_job.attempt_id for update;
  v_passed := coalesce((p_decision->>'passed')::boolean, false);
  v_total := (p_decision->>'total')::numeric;
  insert into public.course_grades
    (attempt_id, generation, job_id, source, rubric_version, model, prompt_version,
     criteria, coverage, misconceptions, caps_applied, total, passed, decision)
  values
    (v_job.attempt_id, v_job.generation, p_job, 'model', p_rubric_version, p_model, p_prompt_version,
     p_validated->'criteria',
     jsonb_build_object('principles', p_validated->'principles', 'tools', p_validated->'tools'),
     coalesce(p_validated->'material_misconceptions', '[]'::jsonb),
     coalesce(p_decision->'caps_applied', '[]'::jsonb),
     v_total, v_passed, p_decision)
  on conflict (attempt_id, generation) do nothing
  returning id into v_grade;
  if v_grade is null then
    select id into v_grade from public.course_grades
      where attempt_id = v_job.attempt_id and generation = v_job.generation;
  end if;
  update public.course_grading_jobs
    set state = 'succeeded', raw_output = p_raw, usage = p_usage, validated = p_validated,
        decision = p_decision, model = p_model, prompt_version = p_prompt_version,
        locked_by = null, locked_at = null, lock_token = null, last_error = null, error_category = null
    where id = p_job;
  update public.course_assessment_attempts
    set state = case when v_passed then 'passed' else 'needs_revision' end,
        grade_id = v_grade, finalized_at = now()
    where id = v_job.attempt_id;
  if v_passed and p_awards_enabled then
    v_serial := 'SSS-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.course_certificate_serial_seq')::text, 5, '0');
    insert into public.course_certificates (serial, user_id, certification_version, attempt_id)
      values (v_serial, v_attempt.user_id, v_attempt.certification_version, v_attempt.id)
      on conflict (user_id, certification_version) do nothing;
  end if;
  return jsonb_build_object('outcome', 'finalized', 'grade_id', v_grade, 'passed', v_passed);
end $$;

/*
 * Fail: a retryable failure with budget left goes back to the queue (and the
 * attempt back to submitted, so the learner sees "grading" again when the
 * next claim happens); anything else is a failed job and a grading_error
 * attempt that an admin retries by hand.
 */
create or replace function public.fail_course_grading_job(
  p_job uuid, p_lock_token uuid, p_category text, p_error text, p_retryable boolean
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_job public.course_grading_jobs%rowtype;
begin
  select * into v_job from public.course_grading_jobs where id = p_job for update;
  if not found or v_job.state <> 'running' or v_job.lock_token is distinct from p_lock_token then
    return jsonb_build_object('outcome', 'stale');
  end if;
  if p_retryable and v_job.attempts < v_job.max_attempts then
    update public.course_grading_jobs
      set state = 'queued', locked_by = null, locked_at = null, lock_token = null,
          last_error = left(p_error, 2000), error_category = p_category
      where id = p_job;
    update public.course_assessment_attempts set state = 'submitted' where id = v_job.attempt_id;
    return jsonb_build_object('outcome', 'requeued', 'attempts', v_job.attempts);
  end if;
  update public.course_grading_jobs
    set state = 'failed', locked_by = null, locked_at = null, lock_token = null,
        last_error = left(p_error, 2000), error_category = p_category
    where id = p_job;
  update public.course_assessment_attempts set state = 'grading_error' where id = v_job.attempt_id;
  return jsonb_build_object('outcome', 'failed');
end $$;

/*
 * Admin retry of a failed job: a fresh budget, the same generation. The output
 * of the failed run is cleared with it, so the admin table shows a clean queued
 * job rather than the last error beside a queued state.
 */
create or replace function public.retry_course_grading_job(p_job uuid, p_admin uuid)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_job public.course_grading_jobs%rowtype;
begin
  select * into v_job from public.course_grading_jobs where id = p_job for update;
  if not found or v_job.state <> 'failed' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  update public.course_grading_jobs
    set state = 'queued', attempts = 0, reason = 'retry', requested_by = p_admin,
        locked_by = null, locked_at = null, lock_token = null,
        last_error = null, error_category = null, raw_output = null,
        usage = null, validated = null, decision = null
    where id = p_job;
  update public.course_assessment_attempts set state = 'submitted' where id = v_job.attempt_id;
  return jsonb_build_object('outcome', 'queued');
end $$;

-- The service role is the only caller of every function (the 0006 pattern).
revoke execute on function public.create_course_attempt(uuid, text, text, integer, text, text, text, uuid, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.create_course_attempt(uuid, text, text, integer, text, text, text, uuid, integer, jsonb, jsonb, jsonb) to service_role;
revoke execute on function public.submit_course_attempt(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.submit_course_attempt(uuid, uuid, text, text) to service_role;
revoke execute on function public.claim_course_grading_job(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.claim_course_grading_job(uuid, text, integer) to service_role;
revoke execute on function public.finalize_course_grade(uuid, uuid, text, jsonb, jsonb, jsonb, text, text, text, boolean) from public, anon, authenticated;
grant  execute on function public.finalize_course_grade(uuid, uuid, text, jsonb, jsonb, jsonb, text, text, text, boolean) to service_role;
revoke execute on function public.fail_course_grading_job(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant  execute on function public.fail_course_grading_job(uuid, uuid, text, text, boolean) to service_role;
revoke execute on function public.retry_course_grading_job(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.retry_course_grading_job(uuid, uuid) to service_role;

alter table public.course_source_packs         enable row level security;
alter table public.course_assessment_attempts  enable row level security;
alter table public.course_assessment_responses enable row level security;
alter table public.course_grading_jobs         enable row level security;
alter table public.course_grades               enable row level security;
alter table public.course_certificates         enable row level security;
alter table public.course_review_requests      enable row level security;

-- Deliberately no policies, and deliberately no grants to anon/authenticated.
grant select, insert                 on public.course_source_packs         to service_role;
grant select, insert, update, delete on public.course_assessment_attempts  to service_role;
grant select, insert, update, delete on public.course_assessment_responses to service_role;
grant select, insert, update, delete on public.course_grading_jobs         to service_role;
grant select, insert                 on public.course_grades               to service_role;  -- append-only
grant select, insert, update         on public.course_certificates         to service_role;
grant select, insert, update         on public.course_review_requests      to service_role;

-- 0030 changed the default privileges for future sequences; this one is
-- revoked explicitly as well so the migration does not depend on that order.
revoke all on sequence public.course_certificate_serial_seq from anon, authenticated;
grant usage on sequence public.course_certificate_serial_seq to service_role;
