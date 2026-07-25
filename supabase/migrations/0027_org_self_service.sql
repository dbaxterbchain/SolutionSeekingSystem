-- Organization self-service.
--
-- Self-serve teams arrive: a buyer checks out the per-seat Teams plan, the
-- Stripe webhook creates the organization and its first manager, and managers
-- run their own org from the dashboard (members, roles, name, seats, billing
-- portal). /admin keeps working as the repair console. This migration adds the
-- columns and backstops that make that safe; every write still goes through
-- the service role, and the browser still never reads org tables directly.

-- 1. Billing mode, explicit rather than inferred.
--
-- 'manual'  = invoice or hand-run Stripe billing (the concierge model from
--             0012). Seat self-service is BLOCKED for these: there is no
--             per-seat subscription whose quantity could follow the seats.
-- 'stripe'  = a self-serve per-seat subscription (STRIPE_PRICE_ID_TEAM) whose
--             item quantity is the seat count. Only the self-serve creation
--             path in the webhook, or a deliberate admin action, sets this.
--
-- Deliberately NOT derived from stripe_subscription_id being present: an admin
-- can stamp a hand-made Stripe subscription (any price, any shape) onto a
-- manual org, and doing per-seat quantity math against such a subscription
-- would corrupt real invoices. The column expresses intent; /api/org's
-- set_seats additionally verifies the item's price id at write time.
alter table public.organizations
  add column if not exists billing text not null default 'manual'
  check (billing in ('manual', 'stripe'));

-- 2. Who bought it (audit trail for self-serve orgs; null for admin-created).
alter table public.organizations
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- 3. Widen the status vocabulary to everything Stripe can actually send.
--
-- The webhook writes sub.status RAW (stripe-webhook.ts syncOrgSubscription).
-- Stripe can emit 'incomplete', 'incomplete_expired', and 'unpaid', none of
-- which passed the 0012 check; the update would raise, the webhook would 500,
-- and Stripe would retry the delivery forever. Latent until now because manual
-- orgs rarely hit those states; self-serve subscriptions will.
--
-- Access is unaffected: ENTITLED_STATUSES in src/lib/server/entitlement.ts is
-- the ONE definition of "entitled" and it does not include any of the new
-- values, so an org in any of them is simply not entitled.
alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check
  check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused',
                    'incomplete', 'incomplete_expired', 'unpaid'));

/*
 * 4. Seat floor: seats can never drop below the current member count.
 *
 * The mirror image of 0012's enforce_org_seats (which stops member INSERTs
 * beyond the cap): this stops the CAP from shrinking under existing members,
 * which would otherwise strand the org in a permanently oversold state that
 * the AFTER INSERT trigger can no longer explain.
 *
 * Every caller pre-checks or clamps (/api/org returns a friendly 409, the
 * admin route pre-checks, the webhook clamps quantity to the member count),
 * so this should never fire. It exists so that no future code path can
 * oversell retroactively. Same errcode (23514) as the seat-cap trigger so the
 * existing friendly-error translation catches it too.
 */
-- search_path pinned in the header per the 0015-0019 hardening (the body
-- schema-qualifies everything, so '' is correct).
create or replace function public.enforce_seat_floor() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  used int;
begin
  if new.seats < old.seats then
    select count(*) into used from public.org_members where org_id = new.id;
    if new.seats < used then
      raise exception 'organization % has % members; cannot reduce to % seats',
        new.id, used, new.seats
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists organizations_seat_floor on public.organizations;
create trigger organizations_seat_floor
  before update of seats on public.organizations
  for each row execute function public.enforce_seat_floor();

-- Same hole 0012 closed on its functions: Postgres grants EXECUTE to PUBLIC
-- on every new function.
revoke execute on function public.enforce_seat_floor() from public, anon, authenticated;

-- 5. The last-manager rule is deliberately NOT a trigger.
--
-- /api/org refuses to remove or demote an organization's only manager, so a
-- team cannot lock itself out. That check lives server-side (TypeScript), not
-- here, because /admin must stay able to repair any weird state, including
-- "this org has no managers" ones a trigger would make unreachable. The tiny
-- concurrent-demotion race that leaves an org managerless is admin-repairable
-- and not worth closing at the cost of the repair path itself.
