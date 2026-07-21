# Architecture

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Astro** (TypeScript) | Content-first, ships zero JS by default, great for a teaching site. |
| Styling | **Tailwind CSS** (`@astrojs/tailwind`) | Fast, consistent, design tokens in `tailwind.config.mjs`. |
| Content | **Content Collections** + **MDX** | Markdown/YAML content with **Zod-typed** schemas. |
| Interactivity | **React islands** (`@astrojs/react`) | Hydrate only the interactive widgets (Phase 2). |
| Accounts & data | **Supabase** (`@supabase/supabase-js`) | Auth (email/password + Google) + Postgres for saved sessions, all client-side with Row-Level Security. Keeps the site static; groundwork for the Phase 3 paywall. See [deployment.md](deployment.md#supabase-accounts--saved-data). |
| Hosting | **Netlify** (`@astrojs/netlify`) | Already in use; adapter enables server endpoints for Phase 3. |

### Why Astro over Next.js

The trajectory is content-heavy now, interactive later, with our own AI agents
eventually. Astro is the best-in-class content-first framework, pairs natively with
Netlify, and its server endpoints (as Netlify Functions) cover the future AI work — so we
get the lightest stack now without a rewrite later. Next.js was the runner-up (better for
a heavily app-driven product, heavier for a mostly-content site).

## Rendering model

- **Static by default.** Every page is prerendered at build time (28 pages today) — fast
  and SEO-friendly.
- The **Netlify adapter is already wired in** (`astro.config.mjs`). Phase 3 AI routes opt
  into on-demand rendering with `export const prerender = false`; everything else stays
  static. No reconfiguration needed.

## Project structure

```
src/
  content/
    config.ts             # Zod schemas for all collections
    principles/*.yaml      # 12 Wisdom Principles (uniform 6-part format)
    protocol/*.md          # 3 Communication Protocol steps (Markdown body)
    tools/*.md             # 4 Leadership Tools (Markdown body)
    demos/*.mdx            # 7 annotated example AI conversations (Phase 4)
  data/
    concepts.ts           # glossary, four pillars, protocol step metadata
    modes.ts              # landing copy for the conversation Modes
    nav.ts                # primary navigation links
  lib/
    contexts.ts           # named-context registry (client-safe half)
    server/               # server-only: agents.ts (prompts), contexts.ts (seed
                          # text), entitlement, stripe, supabaseAdmin, auth
  components/             # Header, Footer, Logo, PageHero, PrincipleCard,
                          # ProtocolDiagram, StepNav
    react/               # interactive React islands (practice tools, ChatView)
    demo/                # static chat-bubble components for demo transcripts
  layouts/
    BaseLayout.astro      # <head>, fonts, header/footer, skip-link
  pages/                  # file-based routes (see below)
  styles/global.css       # Tailwind layers + brand component classes (.btn, .prose-sss)
public/
  brand/                 # logo.svg, logo.png, wordmark.png
  favicon.svg
  solution-seeking-complete-guide.pdf
astro.config.mjs · tailwind.config.mjs · tsconfig.json · netlify.toml
```

### Routes

| Route | File | Notes |
|-------|------|-------|
| `/` | `pages/index.astro` | Showcase home |
| `/system` | `pages/system.astro` | Overview + pillars + glossary |
| `/protocol` | `pages/protocol/index.astro` | Protocol overview |
| `/protocol/:step` | `pages/protocol/[step].astro` | One per protocol step |
| `/principles` | `pages/principles/index.astro` | Grid of all 12 |
| `/principles/:slug` | `pages/principles/[slug].astro` | Renders the 6-part format |
| `/tools` | `pages/tools/index.astro` | Tools overview + "build your own" |
| `/tools/:tool` | `pages/tools/[tool].astro` | One per leadership tool |
| `/practice` | `pages/practice.astro` | Assistants + modes + demos + interactive tools index |
| `/practice/modes` | `pages/practice/modes/index.astro` | Modes hub ("Who is the conversation with?") |
| `/practice/modes/:mode` | `pages/practice/modes/[mode].astro` | Mode landing: SEO hero + embedded seeded ChatView |
| `/practice/demos` | `pages/practice/demos/index.astro` | Demo library gallery |
| `/practice/demos/:demo` | `pages/practice/demos/[demo].astro` | Annotated demo transcript + seeded-chat CTA |
| `/practice/guide` · `/practice/mentor` | `pages/practice/{guide,mentor}.astro` | AI chat (ChatView island); `?context=<id>` seeds, `?chat=<id>` resumes |
| `/practice/introspection` | `pages/practice/introspection.astro` | Introspection worksheet (React island) |
| `/practice/conversation-planner` | `pages/practice/conversation-planner.astro` | Conversation planner (React island) |
| `/practice/solution-builder` | `pages/practice/solution-builder.astro` | Solution builder (React island) |
| `/account` | `pages/account.astro` | Sign in / register + saved-work library (React island) |
| `/dashboard` | `pages/dashboard.astro` | Subscriber workspace (`DashboardView` island); prerendered shell, `noindex`, gates client-side |
| `/a/:org/:slug` | `pages/a/[org]/[slug].astro` | **Server-rendered** (`prerender = false`) white-label page; bare `WhiteLabelLayout`, `noindex`, 404 for unknown/inactive; the only per-request `.astro` route |
| `/about` | `pages/about.astro` | Story + resources |
| `404` | `pages/404.astro` | Not-found |

Dynamic pages use `getStaticPaths()` to prerender one page per content entry, with
prev/next navigation derived from the collection order.

### Shared chat modules

The chat UI is one core, reused by three surfaces (the public `ChatView` on
`/practice/*`, the subscriber `DashboardView` on `/dashboard`, and later white-label
pages). The shared pieces live in `src/components/react/chat/`
(`Markdown` renderer, `MessageBubble` + message actions, `Composer`) and
`src/lib/chatStream.ts` (`streamChat`, the single definition of the `POST /api/chat` wire
contract and its streaming/response handling). Each surface keeps only its own gate logic:
`ChatView` owns the anonymous-trial machinery and paywall; `DashboardView` owns the
simpler subscriber gate and the sidebar launcher. Anything that must not drift between
them (stream protocol, rendering, persistence via `chatSessions.ts`) is in the shared
modules, not copied.

### Documents (dashboard uploads)

Subscribers upload PDF / .docx / .txt / .md in the dashboard. The file goes **straight to
Supabase Storage** from the browser (a private `documents` bucket, folder-scoped to the
uploader's `<user_id>/`), sidestepping the ~6 MB Netlify function body limit; then
`POST /api/documents` downloads it with the service role, extracts the text once
(`src/lib/server/extractText.ts` — `unpdf` for PDF, `mammoth` for docx), and stores it in
the server-only `documents` table (RLS on, no client grants). Up to three documents attach
to a chat message: `/api/chat` resolves the referenced rows (own rows only) and injects
their text into that user turn. All message assembly — chat turns, attachment blocks, and
the per-assistant cache breakpoint coming in Phase C — lives in one place,
`src/lib/server/chatMessages.ts`, so the prompt-cache invariant has a single home. New
server-only tables follow the `0012` pattern and are reached only through Bearer-authed API
routes gated by `requireSubscriber` (`src/lib/server/subscriberAuth.ts`), never client RLS.

### Specialized assistants

A specialized assistant is a saved (base agent + optional mode + custom instructions + up
to five knowledge documents), in the server-only `assistants` / `assistant_documents`
tables, managed through `/api/assistants`. Personal by default; a member with the new
`manager` role on `org_members` (set from `/admin`) can share one org-wide by stamping its
`org_id`, and every member then uses it with their own private history (`chat_sessions`
gains a nullable `assistant_id`). Org membership and the manager role are resolved
server-side by `getOrgMembership` (`src/lib/server/orgMembership.ts`), since the browser
can't read org tables.

When a chat runs against an assistant, `/api/chat` loads it (owner or org member, else a
non-probeable 404), derives the agent and mode from it, and `buildAssistantSetup`
(`src/lib/server/assistants.ts`) turns its instructions + document text into one
**byte-deterministic** `<assistant_setup>` string. `chatMessages.ts` injects that as a
single `cache_control`'d block at the head of the messages — the 4th and last cache
breakpoint after grounding + persona + context seed — so `(system + setup)` is a stable
cached prefix per assistant, identical across every user of a shared assistant.

The setup lives in `messages` (not `system`) to keep the prompt-cache invariant, but that
means the base persona in `system` outranks it. So `SHARED_CONDUCT` in `agents.ts` carries
a byte-stable "Specialized setup" clause telling the assistant that an `<assistant_setup>`
block is trusted operator configuration to adopt (name, instructions, documents), not a
user override to refuse. Without it the personas reject the setup as prompt injection.

### White-label pages

A manager can publish a branded chat page at `/a/<org-id>/<slug>` for a shared assistant or
a standard agent (`white_label_pages` table + a public `branding` bucket for logos). This is
the one **server-rendered** page: `src/pages/a/[org]/[slug].astro` (`prerender = false`) looks
the page up per request by (org id, slug) with the service role, 404s on anything unknown or
inactive, and renders a bare `WhiteLabelLayout` (noindex, no site header/analytics, canonical
always pointing at solutionseeking.com). Chatting requires sign-in (no anonymous trial); for a
specialized-assistant page, `/api/chat`'s existing org-membership check is the access gate.
Managers manage pages from a dashboard panel (`WhiteLabelPanel`); custom domains are a
concierge step (Netlify alias + a root-only `netlify.toml` rewrite), documented in
deployment.md. The org id is in the URL so slugs are unique per org, never globally.

## Content model

The 12 principles share an identical schema (`principles` collection), so the detail
template renders any principle uniformly — add a new YAML file and a new page appears,
guaranteed to have every section. See [content-guide.md](content-guide.md).
