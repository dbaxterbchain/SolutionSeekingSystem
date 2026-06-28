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

## Quick links

- **Live site:** https://solution-seeking-system.netlify.app
- **Target domain:** https://www.solutionseeking.com
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
