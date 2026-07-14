# Change Checklist

The standard for shipping changes to this site. Find the section(s) matching what you're
changing and walk the list. The goal: nothing silently missing — no 404 OG images, no
stale docs, no orphaned pages, no broken prompt cache.

## Every change

- [ ] `npm run check` passes (types + content schemas).
- [ ] `npm run build` passes. Locally without a `.env`, set placeholder public vars first:
      `PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`, `PUBLIC_SUPABASE_ANON_KEY=x`
      (prerendering imports the Supabase client at module load).
- [ ] Click through the changed flow in `npm run dev` — not just the build.
- [ ] **New user-facing copy contains no AI tells** — above all, no em dashes (`—`) and no
      en dashes between words; see the "Voice & punctuation" section in
      [content-guide.md](content-guide.md). Quick audit: search changed files for `—`.
- [ ] **Does this add a step to the funnel?** If a change adds a CTA, a signup path, a
      gate, or a checkout entry point, it needs an event. Static links: add
      `data-track-cta="<location>" data-track-label="..."` (the delegated listener in
      BaseLayout handles the rest). React: `track({...})` from
      [`src/lib/analytics.ts`](../src/lib/analytics.ts) — add the event to the union
      there, never push to `dataLayer` ad hoc. New event params must also be registered
      as GA4 custom dimensions (see [deployment.md](deployment.md#4-ga4-ui-setup)) or
      they are collected but unreportable.
- [ ] **Update [status.md](status.md) in the same commit** if scope/status changed; update
      [roadmap.md](roadmap.md) / [architecture.md](architecture.md) /
      [content-guide.md](content-guide.md) if the plan, structure, or authoring format
      changed. This file too, if the change adds a new kind of touchpoint.

## New page or route

- [ ] **OG image**: register the route in `src/pages/og/[...route].ts` (static entry or a
      collection spread). BaseLayout derives `/og/<path>.png` by convention — an
      unregistered page ships a 404 `og:image`. Verify the PNG exists in `dist/og/` after
      build.
- [ ] **Sitemap**: automatic for static pages; add to the exclusion filter in
      `astro.config.mjs` only if the page should be hidden (like `/account`).
- [ ] **Indexing**: pass `noindex` to BaseLayout for private/utility pages.
- [ ] **Structured data**: add JSON-LD via `src/lib/schema.ts` helpers (`breadcrumbs` at
      minimum; `learningArticle`/`webApplication`/etc. as fits).
- [ ] **Reachability**: link it from somewhere real — nav (`src/data/nav.ts`), footer
      (`src/components/Footer.astro`), a section index, or a parent page. No orphans.
- [ ] **llms.txt**: if it's content an LLM should discover, add it to
      `src/pages/llms.txt.ts`.
- [ ] **Title/description**: unique `title` + `description` props to BaseLayout.

## Content collection changes

- [ ] New entry in an existing collection: schema validation covers you — but check the
      places that *feature* subsets (e.g. `/practice` shows the first 3 demos by `order`;
      home shows 6 principles).
- [ ] New collection: schema in `src/content/config.ts` → register in `collections`
      export; OG spread; llms.txt section; authoring section in
      [content-guide.md](content-guide.md); gallery/detail pages with `getStaticPaths`.
- [ ] Renamed slug/id: it's a live URL — check inbound links across the site, `llms.txt`,
      OG route keys, and anything that hardcodes the id (e.g. demo `context` frontmatter,
      `protocolSteps` in `src/data/concepts.ts`).

## AI / chat changes (`src/lib/server/agents.ts`, `contexts.ts`, `/api/chat`)

- [ ] **Prompt-cache invariant**: the grounding block stays byte-identical and FIRST;
      system content may vary only across the fixed (agent, context) registry enum. Never
      interpolate per-request/per-user data into `system` — dynamic context belongs in
      `messages`. Breaking this silently multiplies token cost per message.
- [ ] **Context registry sync**: an id must exist in BOTH `src/lib/contexts.ts` (UI
      metadata) and `src/lib/server/contexts.ts` (seed) — TypeScript enforces it. Demos
      referencing contexts are cross-checked at build time.
- [ ] **Never type a price or a free-message count.** Import from
      [`src/data/pricing.ts`](../src/data/pricing.ts) (`PLANS`, `priceCopy`,
      `FREE_ANON_MESSAGES`, `FREE_ACCOUNT_MESSAGES`). These appear in page copy, the chat
      UI, JSON-LD offers, and llms.txt: a hardcoded copy means a price change silently
      makes most of the site lie to customers and to Google. Audit with
      `Select-String -Path src\**\* -Pattern '\$5|5\.00|= 10;'`.
- [ ] **New mode** = exactly three files: `src/lib/contexts.ts` (id + `kind:'mode'`
      meta), `src/lib/server/contexts.ts` (seed), `src/data/modes.ts` (landing copy —
      authored together with the seed). The landing page, hub card, pickers, OG card, and
      llms.txt line generate automatically; build-time cross-checks catch mismatches.
- [ ] **Persona/prompt edits**: re-read the demo transcripts (`src/content/demos/`) — they
      are behavior specs. If the assistant would now behave differently, update the demos
      or reconsider the edit. Each demo's frontmatter `spec` lists expected/unacceptable
      behaviors to check against.
- [ ] **Entitlement**: does the change affect the 10-free-message flow or subscriber
      gating? Server logic in `src/lib/server/entitlement.ts` is authoritative; the client
      mirror lives in `ChatView.tsx`.
- [ ] Test the matrix: new chat, `?context=` chat, resume via `?chat=`, History → open,
      New conversation, signed-out → sign-in round trip.

## Database changes (Supabase)

- [ ] Migration file: `supabase/migrations/000N_description.sql`, applied with
      `npx supabase db push` (a "failed to cache migrations catalog" / pg-delta warning
      after "Applying migration…" is harmless — see [deployment.md](deployment.md)).
- [ ] Verify: `npx supabase migration list` shows it on remote; spot-check with
      `npx supabase db query --linked "..."`.
- [ ] **RLS on every new table** in an exposed schema + explicit `GRANT` to
      `authenticated`/`anon` as appropriate (see migrations 0003/0004 for the pattern).
      New columns on existing tables inherit row-scoped policies and table-level grants —
      usually no new policy needed.
- [ ] **A new table reaches the browser only if you say so.** Migration `0010` revoked the
      Supabase default privileges that used to grant `anon`/`authenticated` ALL on every new
      `public` table, so a new table now has **no client grants at all** until a migration adds
      them. If the browser must read it: `grant select on <table> to authenticated;` *and* a
      row-scoped policy. Both, or it fails closed. (Before 0010, the opposite was true and the
      migrations' own comments were wrong about it — RLS was the only thing protecting the
      email list. Do not reintroduce that.)
- [ ] Entitlement-bearing tables stay server-write-only — **no client write policies AND no
      client write grants** (`subscriptions`, `ai_usage`; see migration `0011`).
- [ ] **Verify the RLS claim rather than asserting it.** Hit the table with the *publishable*
      key and confirm the read is empty and the write is refused. Local and the hosted project
      have had different default grants, so "it's safe locally" has proven nothing.
- [ ] Update TypeScript types that mirror the schema (e.g. `src/lib/chatSessions.ts`).

## Claims about users, and social proof

- [ ] **Never fabricate a testimonial, a user count, or a review.** Not as a placeholder, not
      as lorem ipsum, not "just for the layout". It is the one thing that would cost more than
      having no social proof at all, and a placeholder has a way of shipping.
- [ ] **Example conversations are fictional and must be labelled so**, wherever they appear.
      Reuse [`DemoDisclaimer.astro`](../src/components/demo/DemoDisclaimer.astro) rather than
      writing new framing. They prove capability; they are not customer stories.
- [ ] **Quoting a demo means quoting it exactly.** The home page excerpt lives in the demo's
      frontmatter and is checked verbatim against that demo's transcript at build time
      ([`src/lib/demoExcerpt.ts`](../src/lib/demoExcerpt.ts)). If you edit either one, the build
      tells you. Do not weaken the check to make a build pass.
- [ ] **Publishing a real testimonial takes two yeses**: their explicit consent checkbox and
      your hand approval. The `testimonials` check constraint enforces it; leave it enforcing.
- [ ] Honest trust signals we *can* use: the Beanchain provenance, the free-forever core, the
      annotated demos. Use those.
- [ ] **Approving a testimonial does not publish it.** Quotes are read from the database at
      BUILD time, so a live site only changes on a rebuild. Approve in `/admin`, then press
      **Publish to site**. The same is true in reverse: if somebody withdraws consent,
      rejecting the row removes it from the *next* build, so reject **and** publish, then
      check it is gone.
- [ ] Testimonial display must survive an empty list (the section disappears) and a missing
      name (no attribution line, and never an invented one like "Verified user").

## Anonymous trial changes

- [ ] **A trial user's work must survive whatever they do next.** Two different paths, and
      they are not the same: **registering** converts the anonymous user in place (same
      `auth.users` id, so conversation + message count carry over with no code), while
      **signing in** to an account they already had is a *different user*, and their work
      would be stranded. `stashTrialSession()` + `/api/claim-trial-work` re-parent it.
- [ ] `linkIdentity()` is for **registering** from a trial, never for signing in. Using it on
      the sign-in path is what broke Google sign-in for everyone who chatted first.
- [ ] **Never merge `ai_usage` across users.** Conversations transfer; free-message allowances
      do not. Merging would punish someone for trying the product twice.
- [ ] Any endpoint that moves data between users must require proof of BOTH sessions. A user
      id is not a credential.

## Entitlement changes

- [ ] **The server decides who is entitled, and the client asks it.** `checkEntitlement()`
      ([`src/lib/server/entitlement.ts`](../src/lib/server/entitlement.ts)) is the only
      authority; `/api/chat` enforces it and `/api/entitlement` reports it. Never re-derive
      entitlement in the browser by reading a table: entitlement can come from a personal
      subscription **or** from an organization paying for the user, and the org tables are
      deliberately unreadable from a browser. A client-side guess locks org members out of a
      product their employer pays for.
- [ ] A failed entitlement lookup must **fail open in the UI** (live composer) and closed on
      the server (the 403 still lands). Never render a paywall because a request failed.
- [ ] New tables backing entitlement stay server-write-only, and the browser never gets a
      policy or a grant on them (migrations `0010`/`0012`).

## New environment variable

- [ ] Add to `.env.example` with a comment.
- [ ] Set in Netlify (mark secrets as secret values).
- [ ] Document in [deployment.md](deployment.md); read server-side via
      `serverEnv()` (`src/lib/server/env.ts`), never expose secrets with a `PUBLIC_` prefix.

## Deploy & post-deploy

- [ ] Migrations applied to the hosted project BEFORE the deploy that needs them.
- [ ] After deploy: click the primary new flow on production once.
- [ ] IndexNow pings search engines automatically on Netlify deploy (netlify.toml plugin);
      for big content additions, also check Google Search Console after a few days.
- [ ] Update [status.md](status.md)'s "At a glance" if the phase/state moved.
