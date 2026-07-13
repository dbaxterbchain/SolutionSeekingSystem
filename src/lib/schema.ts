import { glossary, systemDefinition } from '../data/concepts';

/**
 * schema.org JSON-LD builders. Pages compose these and pass them to
 * BaseLayout's `schemas` prop. Kept deliberately conservative — every claim
 * in the markup is visible on the page it annotates.
 */

export type Schema = Record<string, unknown>;

export const SITE_NAME = 'Solution Seeking System';

const CONTEXT = 'https://schema.org';

const orgId = (site: URL) => new URL('/#organization', site).href;

export function organization(site: URL): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': orgId(site),
    name: 'Beanchain Coffee LLC',
    url: 'https://www.bchain.coffee',
    logo: new URL('/brand/logo.png', site).href,
    founder: [
      { '@type': 'Person', name: 'David Baxter' },
      { '@type': 'Person', name: 'Shannon Baxter' },
    ],
  };
}

export function webSite(site: URL): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: 'SSS',
    url: site.href,
    description: systemDefinition,
    publisher: { '@id': orgId(site) },
    inLanguage: 'en',
  };
}

export function breadcrumbs(site: URL, items: { name: string; path: string }[]): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: new URL(item.path, site).href,
    })),
  };
}

export function learningArticle(
  site: URL,
  opts: { headline: string; description: string; path: string; teaches?: string }
): Schema {
  return {
    '@context': CONTEXT,
    '@type': ['Article', 'LearningResource'],
    headline: opts.headline,
    description: opts.description,
    url: new URL(opts.path, site).href,
    ...(opts.teaches ? { teaches: opts.teaches } : {}),
    isAccessibleForFree: true,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: site.href },
    publisher: { '@id': orgId(site) },
  };
}

export function faqPage(faq: { q: string; a: string }[]): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function protocolHowTo(
  site: URL,
  steps: { step: number; title: string; slug: string; oneLine: string }[]
): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'HowTo',
    name: 'The Communication Protocol',
    description:
      'The repeatable three-step communication pattern at the core of the Solution Seeking System: Introspection, Mutual Understanding, and Solution Seeking.',
    step: steps.map((s) => ({
      '@type': 'HowToStep',
      position: s.step,
      name: s.title,
      text: s.oneLine,
      url: new URL(`/protocol/${s.slug}`, site).href,
    })),
  };
}

export function glossaryTermSet(site: URL): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'DefinedTermSet',
    name: `${SITE_NAME}: Key Terminology`,
    url: new URL('/system', site).href,
    hasDefinedTerm: glossary.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.term,
      description: t.definition,
    })),
  };
}

export function webApplication(
  site: URL,
  opts: {
    name: string;
    description: string;
    path: string;
    /** Monthly subscription price; omit for free tools. */
    offer?: { price: string };
  }
): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'WebApplication',
    name: opts.name,
    description: opts.description,
    url: new URL(opts.path, site).href,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: opts.offer
      ? {
          '@type': 'Offer',
          price: opts.offer.price,
          priceCurrency: 'USD',
          category: 'Subscription',
        }
      : { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': orgId(site) },
  };
}

export function aboutPage(site: URL): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'AboutPage',
    name: `About the ${SITE_NAME}`,
    url: new URL('/about', site).href,
    about: { '@type': 'WebSite', name: SITE_NAME, url: site.href },
    publisher: { '@id': orgId(site) },
    hasPart: {
      '@type': 'DigitalDocument',
      name: 'Solution Seeking System: Complete Guide',
      url: new URL('/solution-seeking-complete-guide.pdf', site).href,
      encodingFormat: 'application/pdf',
      isAccessibleForFree: true,
    },
  };
}
