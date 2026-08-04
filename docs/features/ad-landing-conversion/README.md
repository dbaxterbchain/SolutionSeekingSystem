# Ad landing conversion

Fixes for the places where a paid click landed somewhere that could not accept
the action its ad promised. Driven by a Google Ads review of both campaigns:
Business spent $164.74 across 58 clicks for zero form starts, and Consumer put
89 people on a mode page for one first message.

The largest single cause was invisible from the ad account. `<ChatView>` is
server-rendered by `client:load` while `useSession()` is still loading, so the
static HTML of every chat page contained a grey "Loading…" card and no composer
at all. A visitor arriving from an ad that says "type your situation" got a hero
and a placeholder box until the React chunk downloaded and Supabase read
localStorage. That is now the real chat instead, composer live, and it is
asserted at the HTML level: `dist/practice/**/index.html` must contain a composer
and no loading card.

Verified end to end in a real browser against the local stack: signed out at
390x844, an anonymous send, a free account, an exhausted free account, and a
returning subscriber.

## Screenshots

- `mode-page-mobile-first-screen.png` — /practice/modes/parent at 390x844,
  signed out. The composer, all three starters, and the "3 free messages, no
  account needed" badge are all in the first viewport. The mobile-only "Start
  the conversation" jump button is gone, and the hero intro and price line are
  now desktop-only, because both were pushing the product below the fold.
- `mode-page-starter-to-reply.png` — after tapping a starter, adding detail, and
  sending: the Guide's mode-appropriate reply, with the composer still pinned.
  Tapping a starter fills the composer and focuses it rather than sending, so a
  canned line never spends one of the three free messages.
- `for-business-enquiry-form.png` — the new `#contact` section on /for-business.
  Both "Talk to us" CTAs now scroll here instead of leaving for /pricing#team,
  which answered a question the ad never asked. Self-serve checkout is still one
  click away for people who already know what they want.
- `for-business-enquiry-success.png` — the confirmed state, after a submission
  that wrote a real `team_enquiries` row.
- `admin-enquiries-queue.png` — where that submission lands: /admin → Enquiries,
  with an unhandled count on the tab and a "Mark handled" toggle. The row is the
  record; the alert email is only the notification, so an unset
  `TEAM_ENQUIRY_TO` costs the ping and never the lead.
- `principle-page-try-it-band.png` — the "How it works" band now closing every
  principle and protocol page. /principles and /protocol previously had no path
  into the product at all, despite the 12 Principles sitelink being the
  highest-CTR asset in the account. The framing is fixed everywhere it appears:
  the Communication Protocol is how a conversation reaches understanding and a
  solution, and the Wisdom Principles are what support it.
- `dashboard-free-tier.png` — /dashboard for a signed-in free account, which used
  to be refused outright. The Guide, the Mentor, and saved history are all live
  on the normal free allowance; assistants, documents, and attachments stay
  behind the subscription, and the rail says so rather than showing an empty
  space.
- `dashboard-free-paywall.png` — the same account with its allowance spent. The
  composer becomes the wall, but the sidebar and past conversations stay
  readable: running out of messages should not lock away work already done.
