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
- [ ] Entitlement-bearing tables stay server-write-only (no client insert/update policies).
- [ ] Update TypeScript types that mirror the schema (e.g. `src/lib/chatSessions.ts`).

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
