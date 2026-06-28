# Deployment

Hosted on **Netlify** under the **Beanchain** team.

| | |
|---|---|
| Site name | `solution-seeking-system` |
| Live URL | https://solution-seeking-system.netlify.app |
| Admin | https://app.netlify.com/projects/solution-seeking-system |
| Repo | https://github.com/dbaxterbchain/SolutionSeekingSystem |
| Build settings | `netlify.toml` (command `npm run build`, publish `dist`, Node 20) |

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

## Phase 3 note (AI agents)

When the Guide/Mentor endpoints land, add the API key as a Netlify environment variable
(**Site configuration → Environment variables**), e.g. `ANTHROPIC_API_KEY`. It stays
server-side; the Astro server endpoints run as Netlify Functions. No other config changes
are required — the adapter is already installed.
