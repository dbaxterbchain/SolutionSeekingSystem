# Solution Seeking System — solutionseeking.com

Astro 5 (static-first, Netlify adapter) + Tailwind + React islands + Supabase (auth,
persistence) + Stripe ($5/mo subscription) + Anthropic API (Guide/Mentor chat assistants).

## Before shipping any change

Walk the matching sections of **[docs/change-checklist.md](docs/change-checklist.md)**.
It covers the touchpoints that are easy to silently miss: OG image registration,
llms.txt, sitemap/noindex, JSON-LD, RLS/grants on migrations, the prompt-cache
invariant for AI changes, env vars, and which docs to update.

Update **[docs/status.md](docs/status.md)** in the same commit as any change that
affects scope or status. Docs index: [docs/README.md](docs/README.md).

## Ground rules

- **Prompt cache**: in `src/lib/server/agents.ts`, the grounding system block stays
  byte-identical and first. System content may vary only across the fixed
  (agent, context) registry. Per-user/dynamic data goes in `messages`, never `system`.
- **Demos are behavior specs**: if you change the assistant personas, re-check the
  transcripts in `src/content/demos/` against their frontmatter `spec`.
- **Entitlements are server-written only** (Stripe webhook + chat endpoint via service
  role); the browser gets read-only RLS access. Never add client write policies to
  `subscriptions`/`ai_usage`.
- Content is Zod-validated collections in `src/content/` — authoring formats are in
  [docs/content-guide.md](docs/content-guide.md).

## Commands

```bash
npm run dev      # local dev → http://localhost:4321
npm run check    # astro check (types + content schemas)
npm run build    # production build; locally set placeholder PUBLIC_SUPABASE_* vars first
```

Migrations: `supabase/migrations/000N_name.sql`, apply with `npx supabase db push`,
verify with `npx supabase migration list`. See [docs/deployment.md](docs/deployment.md).
