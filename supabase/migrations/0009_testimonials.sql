-- Feedback and testimonials.
--
-- The site has no social proof, and the honest fix is to collect real proof
-- rather than invent it. We ask exactly once, at the only moment we have earned
-- an answer: when a conversation reaches a prep summary, meaning it actually
-- finished the protocol.
--
-- TWO things are stored, and the distinction matters:
--   * `helpful` is the QUALITY SIGNAL, recorded for everyone who answers. "Not
--     yet" is the more valuable answer of the two and the only one we would
--     never otherwise hear: nobody emails to say the assistant was mediocre.
--   * name/role/quote are the TESTIMONIAL, present only when someone writes one.
--
-- Publishing requires BOTH explicit consent and hand approval, and that is
-- enforced here rather than trusted to a form: the check constraint below makes
-- it impossible to mark a row `approved` unless the person consented and
-- actually wrote something. A UI bug must not be able to put words in a real
-- person's mouth on our home page.
--
-- Server-write-only, like every other table that must not be forgeable from a
-- browser: RLS on, no policies. Everything goes through /api/testimonial with the
-- service role.
--
-- NOTE: the hosted project's default privileges grant anon/authenticated ALL on
-- new tables in `public` regardless of what this file says, so the revoke that
-- actually makes that true lives in 0010. RLS holds either way; 0010 is the
-- second layer.

create table if not exists public.testimonials (
  id              uuid primary key default gen_random_uuid(),

  -- The quality signal. Always present.
  helpful         boolean not null,
  agent           text not null check (agent in ('guide', 'mentor')),
  -- Named context/mode id (src/lib/contexts.ts), when the chat had one.
  context         text,
  -- How many messages the conversation took to get there.
  message_count   integer,

  -- The testimonial. Null unless they wrote one.
  display_name    text,
  role_title      text,
  quote           text,
  -- Explicitly ticked, never defaulted true. No consent, no publication.
  consent_publish boolean not null default false,

  -- The "what was missing?" answer on the negative path. Kept separate from
  -- `quote` so a complaint can never be mistaken for a publishable endorsement.
  note            text,

  -- Hand-moderated: nothing reaches the site automatically.
  status          text not null default 'new'
                  check (status in ('new', 'approved', 'rejected')),

  -- Set for anonymous trial users too, not just registered ones: the FK's
  -- `on delete set null` releases it when the nightly anon cleanup reaps them,
  -- and until then it lets a rating be joined to the conversation behind it.
  user_id         uuid references auth.users (id) on delete set null,
  -- Was this a trial user? Their first impression is the one worth watching.
  is_anonymous    boolean not null default false,
  -- Lets us re-read the conversation a quote came from before publishing it.
  chat_id         uuid references public.chat_sessions (id) on delete set null,
  -- Salted hash only, never a raw IP (see src/lib/server/rateLimit.ts).
  ip_hash         text,
  created_at      timestamptz not null default now(),

  -- A row can only be approved if there is a quote AND consent to publish it.
  constraint testimonials_approved_requires_consent check (
    status <> 'approved'
    or (consent_publish and quote is not null and length(btrim(quote)) > 0)
  )
);

create index if not exists testimonials_status_idx on public.testimonials (status);
create index if not exists testimonials_created_idx on public.testimonials (created_at desc);

alter table public.testimonials enable row level security;
-- Deliberately no policies: the service role (which bypasses RLS) is the only
-- reader or writer. A browser must never read or forge feedback.
grant select, insert, update on public.testimonials to service_role;
