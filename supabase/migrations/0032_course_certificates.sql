-- Certificates: what the certificate page, the verify page and the admin tab
-- need beyond 0031. That migration created the table, and its
-- finalize_course_grade issues a certificate when a passed attempt is graded
-- with awards on. This one adds the admin's way to issue one for a pass that
-- was recorded while awards were off, the way to revoke one, and the claim
-- column for the certificate email. Same rules as 0030 and 0031: RLS on, no
-- policies, service_role only, security invoker, empty search_path. 0030 and
-- 0031 are frozen; nothing here edits them.

alter table public.course_certificates
  add column if not exists email_sent_at timestamptz,
  add column if not exists issued_by uuid references auth.users (id) on delete set null,
  add column if not exists revoked_by uuid references auth.users (id) on delete set null;

comment on column public.course_certificates.email_sent_at is
  'Claimed by the sender before the certificate email goes out: the guard that outlives the Resend idempotency window.';
comment on column public.course_certificates.issued_by is
  'The admin who issued it by hand; null when finalize_course_grade issued it.';
comment on column public.course_certificates.revoked_by is
  'The admin who revoked it.';

/*
 * Issue a certificate for a passed attempt by hand: the path for a pass that
 * was recorded while COURSE_AWARDS_ENABLED was off. The attempt row lock
 * serialises two admins pressing Issue at once, and the unique (user, version)
 * constraint makes a race with finalize_course_grade harmless. The serial
 * format matches finalize_course_grade in 0031, which is frozen, so the
 * expression lives in both places on purpose.
 */
create or replace function public.issue_course_certificate(p_attempt uuid, p_admin uuid)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt public.course_assessment_attempts%rowtype;
  v_id uuid;
  v_serial text;
begin
  select * into v_attempt from public.course_assessment_attempts where id = p_attempt for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_attempt.state <> 'passed' then
    return jsonb_build_object('outcome', 'not_passed');
  end if;
  select id into v_id from public.course_certificates
    where user_id = v_attempt.user_id and certification_version = v_attempt.certification_version;
  if v_id is not null then
    return jsonb_build_object('outcome', 'already_issued', 'certificate_id', v_id);
  end if;
  v_serial := 'SSS-' || to_char(now(), 'YYYY') || '-'
    || lpad(nextval('public.course_certificate_serial_seq')::text, 5, '0');
  insert into public.course_certificates (serial, user_id, certification_version, attempt_id, issued_by)
    values (v_serial, v_attempt.user_id, v_attempt.certification_version, v_attempt.id, p_admin)
    on conflict (user_id, certification_version) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.course_certificates
      where user_id = v_attempt.user_id and certification_version = v_attempt.certification_version;
    return jsonb_build_object('outcome', 'already_issued', 'certificate_id', v_id);
  end if;
  return jsonb_build_object('outcome', 'issued', 'certificate_id', v_id, 'serial', v_serial);
end $$;

/*
 * Revoke: the status, the time, the reason and who did it. The sharing
 * columns are left alone; the verify lookup requires status = 'active', so a
 * shared link goes dark the moment this commits, and the learner's page
 * shows the revoked state.
 */
create or replace function public.revoke_course_certificate(p_certificate uuid, p_admin uuid, p_reason text)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_cert public.course_certificates%rowtype;
begin
  select * into v_cert from public.course_certificates where id = p_certificate for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_cert.status = 'revoked' then
    return jsonb_build_object('outcome', 'already_revoked');
  end if;
  update public.course_certificates
    set status = 'revoked', revoked_at = now(), revoke_reason = p_reason, revoked_by = p_admin
    where id = p_certificate;
  return jsonb_build_object('outcome', 'revoked');
end $$;

-- The service role is the only caller (the 0006 pattern).
revoke execute on function public.issue_course_certificate(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.issue_course_certificate(uuid, uuid) to service_role;
revoke execute on function public.revoke_course_certificate(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.revoke_course_certificate(uuid, uuid, text) to service_role;
