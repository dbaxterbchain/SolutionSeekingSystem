# Documentation

Project documentation for the **Solution Seeking System** website.

| Doc | What's in it |
|-----|--------------|
| [status.md](status.md) | Current project status — what's done, what's in progress, what's next. **Start here.** |
| [roadmap.md](roadmap.md) | The phased plan (Phase 1 → 3) with detailed scope for each phase. |
| [architecture.md](architecture.md) | Tech stack, why we chose it, and how the project is structured. |
| [content-guide.md](content-guide.md) | How to add or edit teaching content (principles, protocol steps, tools, glossary). |
| [design-system.md](design-system.md) | Brand tokens, fonts, and the shared UI components. |
| [deployment.md](deployment.md) | Hosting on Netlify, continuous deploys, and the custom domain. |
| [change-checklist.md](change-checklist.md) | **The standard for shipping changes** — touchpoints to check per change type (pages, content, AI/prompts, database, env vars, deploys). |
| [ads-campaign.md](ads-campaign.md) | The Google Ads build sheet: settings, keywords, ad copy, negatives, and the decision rule for the paid test. |
| [ads-api-setup.md](ads-api-setup.md) | One-time Google Ads API credential setup (MCC, developer token, OAuth, refresh token) powering the `ads/` toolkit and the google-ads MCP server. |

## Quick links

- **Live site:** https://solutionseeking.com
- **Repo:** https://github.com/dbaxterbchain/SolutionSeekingSystem
- **Netlify admin:** https://app.netlify.com/projects/solution-seeking-system

## Quick start

```bash
npm install      # install dependencies
npm run dev      # local dev → http://localhost:4321
npm run build    # production build → dist/
npm run check    # type-check (.astro + content schemas)
```

## Keeping docs current

These are living documents. When you ship a change that affects scope, status, or how
things work, update the relevant doc in the same commit. `status.md` should always
reflect reality.

Before shipping any change, walk the matching sections of
[change-checklist.md](change-checklist.md) — it lists the touchpoints (OG images,
llms.txt, sitemap, RLS, prompt-cache rules, docs) that are easy to silently miss.
