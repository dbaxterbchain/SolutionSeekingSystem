# Solution Seeking System — solutionseeking.com

Astro 5 (static-first, Netlify adapter) + Tailwind + React islands + Supabase (auth,
persistence) + Stripe ($8/mo subscription) + Anthropic API (Guide/Mentor chat assistants).

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
- **Assistant setup is the only non-registry prompt content.** It is injected into
  `messages` (never `system`) as one `cache_control`'d text block built
  byte-deterministically by `buildAssistantSetup` (`src/lib/server/assistants.ts`) — no
  timestamps, documents in fixed order — so the cache hits after the first message; editing
  an assistant intentionally rolls its cache entry. All message assembly (chat turns,
  attachments, the setup block) lives in `src/lib/server/chatMessages.ts`.
- **Demos are behavior specs**: if you change the assistant personas, re-check the
  transcripts in `src/content/demos/` against their frontmatter `spec`.
- **Entitlements are server-written only** (Stripe webhook + chat endpoint via service
  role); the browser gets read-only RLS access. Never add client write policies to
  `subscriptions`/`ai_usage`.
- Content is Zod-validated collections in `src/content/` — authoring formats are in
  [docs/content-guide.md](docs/content-guide.md).
- **Nothing we publish should read as though a machine wrote it.** That is the actual
  rule, and everything below is a symptom of breaking it, not a separate rule.

  **Fix the sentence, never the character.** No em dashes (—) in user-facing copy:
  pages, content, alt text, error messages. But swapping one in for a comma and moving
  on is the wrong fix, because the result is a comma splice, and a page of comma splices
  reads *more* like a machine than the dash did. Read the sentence, work out what the
  dash was doing, and rewrite it so it still lands. Usually that means a full stop and
  two sentences. Sometimes a colon, or parentheses, or dropping the aside entirely
  because it was padding. Audit with `grep -rn "—" src/`, then edit with your brain.

  This applies to migrated content too. Search-and-replace across somebody's published
  writing is exactly the automated-sounding edit the rule exists to prevent.

  **The other tells**, same treatment: "delve", "It's not just X, it's Y", "Moreover" and
  "Furthermore", every list item opening the same way, and relentless triplets. Prefer
  plain, specific sentences. When a sentence sounds off, the fix is a better sentence,
  not a substituted token.

## Commands

```bash
npm run dev      # local dev → http://localhost:4321
npm run check    # astro check (types + content schemas)
npm run build    # production build; locally set placeholder PUBLIC_SUPABASE_* vars first
```

Migrations: `supabase/migrations/000N_name.sql`, apply with `npx supabase db push`,
verify with `npx supabase migration list`. See [docs/deployment.md](docs/deployment.md).

Google Ads work uses the global **adkit** CLI (private repo `dbaxterbchain/adkit`), e.g.
`adkit report --client sss --preset perf`; the campaign spec lives in that repo at
`clients/sss/campaigns.json`. See [docs/ads-api-setup.md](docs/ads-api-setup.md).

## Verifying features in the browser

After building or changing a user-facing feature, verify it end to end in a real browser,
not just `npm run check`. Drive it with the **Playwright MCP** plugin (managed Chromium);
in a headless session where those tools aren't loaded, fall back to `playwright-core`
against the system Chrome.

Save the final, successful screenshots to `docs/features/<feature-name>/` with descriptive
kebab-case names (e.g. `subscriber-dashboard-streamed-reply.png`) plus a short `README.md`
captioning each. Curated copies only: raw session output (`.playwright-mcp/`) is gitignored.
This keeps an on-hand visual record of every shipped feature.

Local auth testing: the local Supabase stack has captcha disabled, so keep
`PUBLIC_TURNSTILE_SITE_KEY` **unset** in `.env`. A set key makes the client demand a
Turnstile token the local stack never asked for, and a headless browser can't solve the
challenge (wrong domain), so sign-in fails.
