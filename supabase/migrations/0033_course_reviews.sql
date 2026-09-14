-- Review requests: a learner says a criterion was scored wrongly, and an
-- operator answers. 0031 created the table; this migration adds the claim
-- column for the review email, records who resolved a request, and gives the
-- two state changes a function each so the writes that must happen together
-- cannot come apart. Same rules as 0030 to 0032: RLS on, no policies,
-- service_role only, security invoker, empty search_path. Nothing here
-- computes a score: the corrected grade arrives already built and decided by
-- decision.ts, which is the only place that owns the rubric.

alter table public.course_review_requests
  add column if not exists email_sent_at timestamptz,
  add column if not exists resolved_by uuid references auth.users (id) on delete set null;

comment on column public.course_review_requests.email_sent_at is
  'Claimed by the sender before the review-received email goes out: the guard that outlives the Resend idempotency window.';
comment on column public.course_review_requests.resolved_by is
  'The admin who resolved it.';

/*
 * Open a review. The attempt row lock serialises two requests racing from two
 * tabs; the partial unique index on open requests is what actually forbids a
 * second one, so a race that gets past the lock lands on the constraint and is
 * reported rather than raised.
 */
drop function if exists public.create_course_review(uuid, uuid, text, text, uuid, jsonb);
create or replace function public.create_course_review(
  p_attempt uuid, p_user uuid, p_criterion text, p_reason text, p_original jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt public.course_assessment_attempts%rowtype;
  v_id uuid;
begin
  select * into v_attempt from public.course_assessment_attempts
    where id = p_attempt and user_id = p_user for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  -- A review is about a grade, so there has to be one.
  if v_attempt.state not in ('passed', 'needs_revision') or v_attempt.grade_id is null then
    return jsonb_build_object('outcome', 'not_reviewable');
  end if;
  begin
    insert into public.course_review_requests
      (attempt_id, user_id, grade_id, criterion_id, reason, original_scores)
    -- v_attempt.grade_id, not a caller-supplied id: the row is locked above,
    -- so this is the grade the attempt holds right now, not whatever the
    -- caller read a couple of awaits earlier, which another resolution can
    -- have since superseded.
    values (p_attempt, p_user, v_attempt.grade_id, p_criterion, p_reason, p_original)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('outcome', 'review_open');
  end;
  return jsonb_build_object('outcome', 'created', 'review_id', v_id);
end $$;

/*
 * Resolve a review. The corrected grade arrives whole: criteria, coverage,
 * misconceptions, the caps decision.ts applied, the total and the pass. This
 * function persists it at the next generation, points the attempt at it, and
 * applies the certificate action the operator chose, all under one lock. The
 * superseded grade is left exactly as the grader wrote it, because
 * course_grades is granted insert and select and nothing else.
 *
 * A certificate action here does not consult COURSE_AWARDS_ENABLED. That flag
 * holds back automatic awards until the grader has earned them; an operator
 * resolving a review has read the response.
 */
create or replace function public.resolve_course_review(
  p_review uuid, p_admin uuid, p_owner text, p_resolution text,
  p_grade jsonb, p_corrected jsonb, p_certificate_action text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_review public.course_review_requests%rowtype;
  v_attempt public.course_assessment_attempts%rowtype;
  v_generation integer;
  v_grade_id uuid;
  v_passed boolean;
  v_serial text;
  v_certificate uuid;
  v_cert_row public.course_certificates%rowtype;
  v_applied text := 'none';
begin
  select * into v_review from public.course_review_requests where id = p_review for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_review.state = 'resolved' then
    return jsonb_build_object('outcome', 'already_resolved');
  end if;
  select * into v_attempt from public.course_assessment_attempts
    where id = v_review.attempt_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select coalesce(max(generation), 0) + 1 into v_generation
    from public.course_grades where attempt_id = v_attempt.id;
  v_passed := coalesce((p_grade->'decision'->>'passed')::boolean, false);

  -- A certificate must never be issued for an attempt that did not pass. The
  -- sibling function issue_course_certificate already refuses this in 0032;
  -- this path had no guard at all, so an operator could issue a credential
  -- the system's own record says was not earned. Checked before the grade
  -- insert, so a refused resolution leaves no trace.
  if p_certificate_action = 'issue' and not v_passed then
    return jsonb_build_object('outcome', 'not_passed');
  end if;

  -- A correction that drops the attempt below the pass line must not leave a
  -- live certificate standing beside it. The operator chooses revoke
  -- deliberately, which is the point: this function does not decide a
  -- credential question quietly, and it does not leave a contradiction
  -- quietly either. Checked before the grade insert, for the same reason.
  if not v_passed and p_certificate_action <> 'revoke' and exists (
    select 1 from public.course_certificates
    where user_id = v_attempt.user_id
      and certification_version = v_attempt.certification_version
      and status = 'active'
  ) then
    return jsonb_build_object('outcome', 'certificate_active');
  end if;

  insert into public.course_grades
    (attempt_id, generation, job_id, source, rubric_version, model, prompt_version,
     criteria, coverage, misconceptions, caps_applied, total, passed, decision)
  values
    (v_attempt.id, v_generation, null, 'review', p_grade->>'rubric_version', null, null,
     p_grade->'criteria', p_grade->'coverage',
     coalesce(p_grade->'misconceptions', '[]'::jsonb),
     coalesce(p_grade->'caps_applied', '[]'::jsonb),
     (p_grade->'decision'->>'total')::numeric, v_passed, p_grade->'decision')
  returning id into v_grade_id;

  update public.course_assessment_attempts
    set state = case when v_passed then 'passed' else 'needs_revision' end,
        grade_id = v_grade_id
    where id = v_attempt.id;

  if p_certificate_action = 'issue' then
    -- Three outcomes, not two: no row at all gets one inserted, same as
    -- before; a revoked row is brought back rather than left alone, which is
    -- the fix this migration makes; an already active row is untouched and
    -- reported as no-op, the same way the revoke branch below already
    -- reports a no-op.
    select * into v_cert_row from public.course_certificates
      where user_id = v_attempt.user_id and certification_version = v_attempt.certification_version
      for update;
    if not found then
      v_serial := 'SSS-' || to_char(now(), 'YYYY') || '-'
        || lpad(nextval('public.course_certificate_serial_seq')::text, 5, '0');
      insert into public.course_certificates (serial, user_id, certification_version, attempt_id, issued_by)
        values (v_serial, v_attempt.user_id, v_attempt.certification_version, v_attempt.id, p_admin)
        on conflict (user_id, certification_version) do nothing
        returning id into v_certificate;
      v_applied := case when v_certificate is null then 'none' else 'issue' end;
    elsif v_cert_row.status = 'revoked' then
      update public.course_certificates
        set status = 'active', revoked_at = null, revoke_reason = null, revoked_by = null,
            attempt_id = v_attempt.id, issued_by = p_admin
        where id = v_cert_row.id;
      v_applied := 'issue';
    else
      v_applied := 'none';
    end if;
  elsif p_certificate_action = 'revoke' then
    update public.course_certificates
      set status = 'revoked', revoked_at = now(), revoke_reason = p_resolution, revoked_by = p_admin
      where user_id = v_attempt.user_id
        and certification_version = v_attempt.certification_version
        and status = 'active'
      returning id into v_certificate;
    v_applied := case when v_certificate is null then 'none' else 'revoke' end;
  end if;

  update public.course_review_requests
    set state = 'resolved', owner = p_owner, resolution = p_resolution,
        corrected_scores = p_corrected, certificate_action = v_applied,
        resolved_at = now(), resolved_by = p_admin
    where id = p_review;

  return jsonb_build_object(
    'outcome', 'resolved', 'grade_id', v_grade_id, 'passed', v_passed,
    'certificate', v_applied
  );
end $$;

-- The service role is the only caller (the 0006 pattern).
revoke execute on function public.create_course_review(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.create_course_review(uuid, uuid, text, text, jsonb) to service_role;
revoke execute on function public.resolve_course_review(uuid, uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant  execute on function public.resolve_course_review(uuid, uuid, text, text, jsonb, jsonb, text) to service_role;
