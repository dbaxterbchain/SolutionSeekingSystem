# For Business marketing page

A single B2B landing page at `/for-business` that sells the three team-facing capabilities to
organizations, linked from the footer. Hand-authored `.astro` (`src/pages/for-business.astro`) with
`BaseLayout` + `PageHero`, JSON-LD (breadcrumbs + organization), an OG card, and an llms.txt entry.
CTAs point at the team-enquiry form (`/pricing#team`).

The screenshots are freshly captured against seeded demo data (a "Beanchain Coffee" org with a
subscriber, a shared "Barista Assistant", sample conversations, and a branded white-label page),
with the Astro dev toolbar hidden. As of the 2026-07-23 SEO/perf pass they live in
`src/assets/marketing/` and are rendered through `astro:assets` `<Image>` (responsive srcset +
AVIF/WebP, intrinsic dimensions so there is no layout shift); curated copies are kept here.

## Screenshots

- **dashboard.png** — The team dashboard: one workspace (org switcher, the Guide/Mentor, a shared
  assistant, recent conversations) with a live Guide conversation. Also shows the subscriber
  "Dashboard" nav button.
- **specialized-agent.png** — A custom "Barista Assistant" answering a company-specific question
  using the shop's own service standards.
- **white-label.png** — The branded white-label page: the assistant on its own page with the org's
  title and no main-site chrome, answering a real question.
- **for-business-page.png** — The assembled `/for-business` page (full length).
