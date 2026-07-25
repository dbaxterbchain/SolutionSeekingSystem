# Organization self-service

Organizations run themselves: self-serve creation from /pricing (per-seat Teams checkout, the
Stripe webhook creates the org with the buyer as first manager), and a manager-facing
"Organization settings" panel in the dashboard for members, roles, name, seats, and billing.
Server surface: `/api/team-checkout`, `/api/org` (gated by `requireManager` in
`src/lib/server/orgAuth.ts`), org creation + seat sync in `/api/stripe-webhook`, and migration
`0027` (billing mode, created_by, seat-floor trigger, widened status vocabulary).

Verified end to end against the local stack + the Stripe test sandbox: a real Checkout purchase
(5 seats at $4, card 4242), webhook org creation (idempotent under duplicate delivery), the full
/api/org curl matrix (21 checks: manager gating, last-manager and seat-floor 409s, manual-billing
block), a live seat change with real Stripe quantity update + proration, the org billing portal,
and cancellation dropping the org to `canceled`.

## Screenshots

- **pricing-team-checkout.png** — the Teams section on /pricing: org name, seat stepper with the
  live monthly total, "Start your team plan", and the collapsed enquiry option for custom deals.
- **dashboard-org-workspace.png** — the dashboard signed in as the buyer after purchase: the new
  org in the workspace switcher and the manager-only "Organization settings" sidebar entry.
- **org-panel-members.png** — the Organization settings panel: rename (with saved notice), member
  list with Claimed/Invited pills and role selects (the last manager's own controls disabled),
  add-member input, seat stepper with the proration note, and the billing section with status,
  renewal date, and the Stripe portal button.
