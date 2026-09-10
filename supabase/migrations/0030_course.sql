-- The paid video course: enrollment, progress, and video-token tables.
--
-- Every table here is server-write-only (the 0012 pattern): RLS on, NO
-- policies, no grants to anon/authenticated. Since 0010 revoked the default
-- privileges, a new table reaches nobody until a grant says otherwise, so the
-- grants at the bottom are the whole access story. The browser learns whether
-- it is enrolled by asking /api/course/entitlement, never by reading a table,
-- and completion prerequisites are validated in one place, /api/course/progress.

create table if not exists public.course_enrollments (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users (id) on delete cascade,
  course_id                   text not null,
  status                      text not null default 'enrolled'
                              check (status in ('enrolled', 'revoked', 'refunded')),
  source                      text not null check (source in ('stripe', 'admin')),
  -- The purchase reference. Unique, so a re-delivered webhook can never enroll twice.
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  stripe_customer_id          text,
  amount_total                integer,          -- cents, exactly as Stripe reports it
  currency                    text,
  purchased_at                timestamptz,
  access_starts_at            timestamptz not null default now(),
  access_ends_at              timestamptz,      -- null = no end date
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- One enrollment per learner per course; the leading user_id also covers the FK.
  unique (user_id, course_id),
  check (source <> 'stripe' or stripe_checkout_session_id is not null)
);

-- Append-only audit of every access change and payment signal, and the
-- processed-once ledger for course webhook deliveries.
create table if not exists public.course_enrollment_events (
  id                          bigint generated always as identity primary key,
  enrollment_id               uuid references public.course_enrollments (id) on delete set null,
  user_id                     uuid not null references auth.users (id) on delete cascade,
  course_id                   text not null,
  kind                        text not null check (kind in (
                                'checkout_created', 'payment_pending', 'payment_failed', 'enrolled',
                                'reinstated', 'duplicate_payment', 'revoked', 'refunded',
                                'admin_granted', 'refund_received')),
  actor                       text not null check (actor in ('stripe', 'admin', 'system')),
  actor_user_id               uuid references auth.users (id) on delete set null,
  stripe_checkout_session_id  text,
  stripe_event_id             text,
  note                        text,
  created_at                  timestamptz not null default now()
);
create index if not exists course_enrollment_events_user_idx
  on public.course_enrollment_events (user_id, created_at desc);
create index if not exists course_enrollment_events_enrollment_idx
  on public.course_enrollment_events (enrollment_id);
create index if not exists course_enrollment_events_actor_idx
  on public.course_enrollment_events (actor_user_id);
create unique index if not exists course_enrollment_events_event_idx
  on public.course_enrollment_events (stripe_event_id) where stripe_event_id is not null;

create table if not exists public.course_progress (
  user_id                 uuid not null references auth.users (id) on delete cascade,
  course_id               text not null,
  lesson_id               text not null check (lesson_id ~ '^v[0-9]{2}$'),
  content_version         integer not null default 1,
  studied_at              timestamptz,
  practice_state          text not null default 'none'
                          check (practice_state in ('none', 'in_site', 'offline')),
  response_text           text not null default '' check (char_length(response_text) <= 20000),
  previous_response_text  text,                      -- kept when a revision conflict is resolved
  model_revealed_at       timestamptz,
  acknowledged_at         timestamptz,
  completed_at            timestamptz,
  revision                integer not null default 0, -- bumps on save_response only
  first_opened_at         timestamptz not null default now(),
  last_opened_at          timestamptz not null default now(),  -- the resume pointer derives from this
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (user_id, course_id, lesson_id)
);

create table if not exists public.course_check_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_id   text not null,
  module_id   text not null check (module_id ~ '^m0[1-8]$'),
  check_id    text not null,
  choice      smallint not null check (choice in (1, 2)),
  correct     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists course_check_attempts_user_idx
  on public.course_check_attempts (user_id, course_id, module_id, created_at desc);

-- One shared signed playback token per Stream video, refreshed every 12 hours.
-- Tokens are not user-bound, so sharing one keeps the mint rate far below the
-- Stream token endpoint's guidance regardless of how many learners watch.
create table if not exists public.course_stream_tokens (
  stream_uid  text primary key,
  token       text not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);

/*
 * Completion is monotone: revisiting, rewatching, or editing a practice answer
 * never erases it. The API is the writer, but the database refuses a
 * regression even if a future route gets it wrong.
 */
create or replace function public.course_progress_monotone() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.studied_at        := coalesce(old.studied_at, new.studied_at);
  new.model_revealed_at := coalesce(old.model_revealed_at, new.model_revealed_at);
  new.acknowledged_at   := coalesce(old.acknowledged_at, new.acknowledged_at);
  new.completed_at      := coalesce(old.completed_at, new.completed_at);
  if old.practice_state <> 'none' and new.practice_state = 'none' then
    new.practice_state := old.practice_state;
  end if;
  new.first_opened_at := old.first_opened_at;
  return new;
end $$;
revoke execute on function public.course_progress_monotone() from public, anon, authenticated;

drop trigger if exists course_progress_monotone on public.course_progress;
create trigger course_progress_monotone
  before update on public.course_progress
  for each row execute function public.course_progress_monotone();

drop trigger if exists course_enrollments_set_updated_at on public.course_enrollments;
create trigger course_enrollments_set_updated_at
  before update on public.course_enrollments
  for each row execute function public.set_updated_at();
drop trigger if exists course_progress_set_updated_at on public.course_progress;
create trigger course_progress_set_updated_at
  before update on public.course_progress
  for each row execute function public.set_updated_at();
drop trigger if exists course_stream_tokens_set_updated_at on public.course_stream_tokens;
create trigger course_stream_tokens_set_updated_at
  before update on public.course_stream_tokens
  for each row execute function public.set_updated_at();

alter table public.course_enrollments       enable row level security;
alter table public.course_enrollment_events enable row level security;
alter table public.course_progress          enable row level security;
alter table public.course_check_attempts    enable row level security;
alter table public.course_stream_tokens     enable row level security;

-- Deliberately no policies, and deliberately no grants to anon/authenticated.
grant select, insert, update, delete on public.course_enrollments       to service_role;
grant select, insert                 on public.course_enrollment_events to service_role;  -- append-only
grant select, insert, update, delete on public.course_progress          to service_role;
grant select, insert                 on public.course_check_attempts    to service_role;
grant select, insert, update, delete on public.course_stream_tokens     to service_role;
