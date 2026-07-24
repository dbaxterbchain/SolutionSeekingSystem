# FAQ answer hub

A single consolidated FAQ page at `/faq`, built during the 2026-07-23 SEO/GEO/AEO pass. It is the
site's answer-engine ("People Also Ask") play: 10 site-wide questions covering what the system is,
what is free, how the Guide and Mentor assistants work, pricing, privacy, and team/white-label use.

- Content lives in `src/data/faq.ts`; prices and free-message allowances are pulled from
  `src/data/pricing.ts` so the answers can never drift from the actual offer.
- The page emits `FAQPage` JSON-LD (via the existing `faqPage` builder in `src/lib/schema.ts`) plus
  breadcrumbs, so search and answer engines can extract the Q&A directly.
- Deliberately broader than, and non-overlapping with, the billing-focused FAQ on `/pricing`.
- Reachable from the footer (Resources) and listed in `/llms.txt`; has its own OG card.

## Screenshots

- **faq-page.png** — the full `/faq` page with the first question expanded.
