import { getCollection } from 'astro:content';
import { OGImageRoute } from 'astro-og-canvas';
import { protocolSteps, systemDefinition } from '../../data/concepts';
import { MODES } from '../../data/modes';
import { PLANS } from '../../data/pricing';

/**
 * Generated 1200×630 social-share cards, one per page. Route keys mirror page
 * paths so BaseLayout can derive `/og/<path>.png` from the URL by convention.
 */

interface OgPage {
  title: string;
  description: string;
}

const principles = (await getCollection('principles')).sort(
  (a, b) => a.data.order - b.data.order
);
const tools = (await getCollection('tools')).sort((a, b) => a.data.order - b.data.order);
const demos = (await getCollection('demos')).sort((a, b) => a.data.order - b.data.order);

const pages: Record<string, OgPage> = {
  index: {
    title: 'Solution Seeking System',
    description:
      'A free framework for democratic problem solving, leadership, and communication.',
  },
  'for-business': {
    title: 'For Business',
    description:
      'A shared dashboard, specialized AI agents grounded in your documents, and white-label assistant pages on your own domain.',
  },
  system: {
    title: 'The System',
    description: systemDefinition,
  },
  protocol: {
    title: 'The Communication Protocol',
    description:
      'Three steps to a real solution: Introspection, Mutual Understanding, Solution Seeking.',
  },
  principles: {
    title: 'The 12 Wisdom Principles',
    description: 'The "source code" of the system: the values that make the protocol work.',
  },
  tools: {
    title: 'Leadership Tools',
    description: 'Real practices that apply the protocol to everyday leadership and teams.',
  },
  practice: {
    title: 'Practice the System',
    description: 'Free interactive tools and AI assistants for practicing the protocol.',
  },
  'practice/introspection': {
    title: 'Guided Introspection',
    description: 'Work through Protocol Step 1 and leave with a conversation prep summary.',
  },
  'practice/conversation-planner': {
    title: 'Conversation Planner',
    description: 'Plan a Mutual Understanding conversation: goals, openers, and questions.',
  },
  'practice/solution-builder': {
    title: 'Solution Builder',
    description: 'Draft solutions that are actionable, testable, effective, and time-bound.',
  },
  guide: {
    title: 'The complete guide, free',
    description:
      'The whole system in one PDF: the Communication Protocol, the 12 Wisdom Principles, and the four Leadership Tools.',
  },
  pricing: {
    title: 'Pricing',
    description: `Most of the system is free forever. Unlimited conversations with the Guide and Mentor are ${PLANS.monthly.priceLabel} a month, or ${PLANS.annual.priceLabel} a year.`,
  },
  faq: {
    title: 'Frequently asked questions',
    description:
      'What the Solution Seeking System is, what is free, how the Guide and Mentor AI assistants work, pricing, privacy, and using it with your team.',
  },
  'practice/modes': {
    title: 'Who is the conversation with?',
    description:
      'The Guide adapts to the relationship: parent, teacher, partner, family, friend, manager, co-worker, or organizer.',
  },
  'practice/demos': {
    title: 'See it in action',
    description:
      'Annotated example conversations showing what people walk away with after using the Guide and Mentor.',
  },
  'practice/guide': {
    title: 'Solution Seeking Guide',
    description:
      'An AI guide that walks you through the Communication Protocol for a real conflict, step by step.',
  },
  'practice/mentor': {
    title: 'Solution Seeking Mentor',
    description:
      'An AI mentor for everything in the system: the protocol, the Wisdom Principles, and the Leadership Tools.',
  },
  about: {
    title: 'About',
    description: 'Why Beanchain Coffee built the Solution Seeking System, and how to use it.',
  },
  account: {
    title: 'Your Account',
    description: 'Save your practice work and pick it back up anytime.',
  },
  dashboard: {
    title: 'Dashboard',
    description: 'Your assistants, conversations, and documents in one place.',
  },
  admin: {
    title: 'Admin',
    description: 'Internal.',
  },
  404: {
    title: 'Page not found',
    description: 'The page you were looking for does not exist.',
  },
  ...Object.fromEntries(
    protocolSteps.map((s) => [
      `protocol/${s.slug}`,
      { title: `Step ${s.step}: ${s.title}`, description: s.oneLine },
    ])
  ),
  ...Object.fromEntries(
    principles.map((p) => [
      `principles/${p.id}`,
      { title: p.data.title, description: p.data.tagline },
    ])
  ),
  ...Object.fromEntries(
    tools.map((t) => [`tools/${t.id}`, { title: t.data.title, description: t.data.summary }])
  ),
  ...Object.fromEntries(
    demos.map((d) => [
      `practice/demos/${d.id}`,
      { title: d.data.title, description: d.data.scenario },
    ])
  ),
  ...Object.fromEntries(
    MODES.map((m) => [
      `practice/modes/${m.id}`,
      { title: m.heroTitle, description: m.metaDescription },
    ])
  ),
};

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page: OgPage) => ({
    title: page.title,
    description: page.description,
    logo: {
      // The S mark only — the full logo's wordmark is unreadable at card size.
      path: './src/assets/og-logo.png',
      size: [96],
    },
    // Brand ink (#16276B) fading toward near-black, brand blue accent bar.
    bgGradient: [
      [22, 39, 107],
      [10, 18, 52],
    ],
    border: { color: [82, 113, 255], width: 16, side: 'inline-start' },
    padding: 72,
    font: {
      title: {
        size: 68,
        families: ['Anton'],
        color: [255, 255, 255],
        lineHeight: 1.1,
      },
      description: {
        size: 30,
        families: ['Poppins'],
        color: [196, 208, 255],
        lineHeight: 1.4,
      },
    },
    fonts: [
      './src/assets/fonts/Anton-Regular.ttf',
      './src/assets/fonts/Poppins-Medium.ttf',
      './src/assets/fonts/Poppins-Bold.ttf',
    ],
  }),
});
