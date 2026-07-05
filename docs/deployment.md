# Deployment

Hosted on **Netlify** under the **Beanchain** team.

| | |
|---|---|
| Site name | `solution-seeking-system` |
| Live URL | https://solution-seeking-system.netlify.app |
| Admin | https://app.netlify.com/projects/solution-seeking-system |
| Repo | https://github.com/dbaxterbchain/SolutionSeekingSystem |
| Build settings | `netlify.toml` (command `npm run build`, publish `dist`, Node 22 — required by `@supabase/supabase-js`) |
| IndexNow | Key file in `public/` + local build plugin (`netlify/plugins/indexnow`) auto-submits all sitemap URLs to api.indexnow.org after each successful production deploy |

The first production deploy was done with the Netlify CLI. For ongoing work, connect the
GitHub repo so every push deploys automatically.

## Set up continuous deployment (recommended)

In the Netlify dashboard → the `solution-seeking-system` site → **Site configuration →
Build & deploy → Continuous deployment → Link repository**:

1. Choose **GitHub** and authorize the Netlify GitHub App (one-time).
2. Pick `dbaxterbchain/SolutionSeekingSystem`, branch `main`.
3. Build command and publish dir are read from `netlify.toml` — leave them as detected.
4. Save. From then on:
   - Push to `main` → production deploy.
   - Open a PR → automatic **deploy preview**.

> Prefer a different existing Netlify project? Link that one to the repo instead — the
> `netlify.toml` makes any Netlify site build correctly. The CLI-created site above can be
> deleted from the dashboard if you don't want it.

## Manual deploy (CLI)

Useful for one-off deploys without going through git.

```bash
netlify deploy --prod     # builds (per netlify.toml) and deploys to production
netlify deploy            # deploys a draft preview URL
netlify status            # show the linked site
netlify open              # open the admin dashboard
```

The local folder is linked via `.netlify/state.json` (gitignored). If a fresh clone needs
linking: `netlify link --name solution-seeking-system`.

## Custom domain — www.solutionseeking.com

In the dashboard → **Domain management → Add a domain** → enter `solutionseeking.com`,
then either:

- **Use Netlify DNS** (point the registrar's nameservers at Netlify), or
- **Keep your DNS** and add records Netlify shows you (a `CNAME` for `www` → the
  `.netlify.app` host, plus an apex/ALIAS record).

Netlify provisions HTTPS automatically once DNS resolves. Set the primary domain to
`www.solutionseeking.com` (or apex — your preference) and Netlify will redirect the other.

## Supabase (accounts & saved data)

Accounts and saved introspections/plans/solutions are powered by **Supabase**. The client
runs entirely in the browser (React islands), so the site stays static — Supabase is not
part of the Netlify build, it's a separate hosted service the browser talks to directly.

| | |
|---|---|
| Project ref | `soetrtogqcpmonoumcjf` |
| Project URL | https://soetrtogqcpmonoumcjf.supabase.co |
| Dashboard | https://supabase.com/dashboard/project/soetrtogqcpmonoumcjf |
| Client key | the project's **publishable** `sb_publishable_…` key (safe to ship to the browser) |

> **Hosted vs. local.** Everything below targets the **hosted** project (what the app's
> `.env` points at). `supabase start` is a *separate* local Docker stack on `localhost` with
> its own database — you don't need it to deploy or to test against the hosted project. See
> [Local Supabase stack](#local-supabase-stack-optional) if you specifically want one.

### 1. Environment variables

Set these in a local `.env` (gitignored — see `.env.example`) **and** in Netlify under
**Site configuration → Environment variables**:

| Var | Value |
|-----|-------|
| `PUBLIC_SUPABASE_URL` | `https://soetrtogqcpmonoumcjf.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | the project's `sb_publishable_…` key (Dashboard → **Project Settings → API keys**) |

The `PUBLIC_` prefix intentionally exposes these to the browser. The publishable key is
safe to ship — **Row-Level Security** (below) is what actually protects user data.

### 2. Apply the database schema (migrations)

The schema lives in [`supabase/migrations/`](../supabase/migrations/) — currently
`0001_saved_sessions.sql` (the `saved_sessions` table + RLS policies). A migration file
does nothing until it's applied to the hosted project. Two ways:

- **SQL Editor (simplest, no tooling):** Dashboard → **SQL Editor** → paste the migration
  file's contents → **Run**.
- **CLI (no Docker needed — `db push` targets the remote directly):**
  ```bash
  supabase link --project-ref soetrtogqcpmonoumcjf
  supabase db push
  ```

> **Gotcha — `PGRST205` (table not found):** if a save fails with `Could not find the table
> 'public.saved_sessions' in the schema cache`, the migration hasn't been applied to this
> project yet (or PostgREST hasn't reloaded). Apply it, then wait a few seconds or force
> **Project Settings → API → Reload schema cache**.

> **Gotcha — `403` permission denied on `/rest/v1/saved_sessions`:** current Supabase does
> **not** auto-expose new `public` tables to the Data API roles, so the table needs an
> explicit `GRANT` to `authenticated` (the migration includes this). If you applied an
> earlier copy of `0001_saved_sessions.sql` **before** that grant was added, re-run the
> migration (or just `grant select, insert, update, delete on public.saved_sessions to
> authenticated;`) on the hosted project, or reads/saves will 403 even though the table
> exists. RLS still restricts every row to its owner.

When you add a new migration, name it `000N_description.sql` and apply it the same way.

### 3. Auth providers

Dashboard → **Authentication → Providers**:

- **Email** — enabled by default. Email confirmation is on by default (users must click a
  link before their first sign-in); toggle it off under **Authentication → Sign In / Up**
  if you want frictionless signup.
- **Google** — create an OAuth client in the [Google Cloud Console](https://console.cloud.google.com/)
  (APIs & Services → Credentials → OAuth client ID → Web application). Set the authorized
  redirect URI to `https://soetrtogqcpmonoumcjf.supabase.co/auth/v1/callback`, then paste
  the client ID + secret into Supabase's Google provider.

### 4. Redirect URLs

Dashboard → **Authentication → URL Configuration**. Set **Site URL** to the production
origin and add every origin the app signs in from under **Redirect URLs** (the app passes
`redirectTo: <origin>/account`):

- `http://localhost:4321` (local dev)
- `https://solution-seeking-system.netlify.app` (and any deploy-preview pattern you use)
- `https://www.solutionseeking.com` (once the custom domain is live)

Missing entries here are the usual cause of a sign-in that bounces back signed-out.

### Local Supabase stack (optional)

A full local stack (Postgres + Auth + Studio) in Docker, for developing against a
throwaway database instead of the hosted project. Already set up in this repo — `supabase/config.toml`
is committed. The CLI is available via `npx supabase` (no global install needed).

```bash
npx supabase start      # boots the stack; auto-applies supabase/migrations/ to the local DB
npx supabase status      # prints the local API URL + keys again
npx supabase db reset    # wipe + re-apply all migrations (use after editing a migration)
npx supabase stop        # shut the stack down
```

**Ports (this machine):** the default `5432x` ports fall inside a WinNAT/Hyper-V reserved
range on this Windows host, so `config.toml` shifts the whole cluster to the **`553xx`**
band (api `55321`, db `55322`, studio `55323`, mailpit `55324`, etc.). That's why the local
URL is `http://127.0.0.1:55321`.

**Point the app at local:** `.env` carries both sets of Supabase vars with one pair
commented out — swap the active pair to switch between the local stack and the hosted
project, then restart `npm run dev` (Astro reads `.env` at startup):

```
PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
PUBLIC_SUPABASE_ANON_KEY=<local publishable key from `npx supabase status`>
```

Local auth has **email confirmation off** (`config.toml` → `[auth.email] enable_confirmations`),
so email/password signup logs you straight in. Test emails are captured in Mailpit at
`http://127.0.0.1:55324` (nothing is actually sent). The local keys are shared, well-known
dev defaults — never use them anywhere real.

> **Windows port gotcha (why the ports are remapped):** on the stock `5432x` ports,
> `supabase start` fails with *"ports are not available … bind: An attempt was made to
> access a socket in a way forbidden by its access permissions"* — those ports sit inside a
> WinNAT/Hyper-V reserved range (list them with `netsh interface ipv4 show
> excludedportrange protocol=tcp`). Two fixes: the one used here is remapping to a free band
> in `config.toml`; alternatively, quit Docker Desktop and run `net stop winnat` /
> `net start winnat` in an **admin** PowerShell to release the reservation, then restart
> Docker.

## Phase 3 note (AI agents)

When the Guide/Mentor endpoints land, add the API key as a Netlify environment variable
(**Site configuration → Environment variables**), e.g. `ANTHROPIC_API_KEY`. It stays
server-side; the Astro server endpoints run as Netlify Functions. No other config changes
are required — the adapter is already installed.
