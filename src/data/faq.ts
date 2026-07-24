import {
  PLANS,
  FREE_ANON_MESSAGES,
  FREE_ACCOUNT_MESSAGES,
} from './pricing';

/**
 * Site-wide FAQ, rendered on /faq and emitted as FAQPage JSON-LD. Deliberately
 * broader than the billing-focused FAQ on /pricing (no overlap). Prices and free
 * allowances come from pricing.ts so the answers can never drift from the offer.
 */
export const siteFaq: { q: string; a: string }[] = [
  {
    q: 'What is the Solution Seeking System?',
    a: 'A framework for democratic problem solving, leadership, and communication. It gives you a repeatable three-step Communication Protocol (understand yourself, understand each other, then seek a solution), backed by 12 Wisdom Principles and 4 Leadership Tools. It is built to turn conflict into progress, in workplaces, families, schools, and communities.',
  },
  {
    q: 'Is it really free?',
    a: 'Yes. The entire system is free to read and always will be: every page, the complete PDF guide, the interactive worksheets, and the annotated example conversations. You only pay if you want unlimited conversations with the AI assistants.',
  },
  {
    q: 'What are the Guide and the Mentor?',
    a: 'They are two AI assistants that apply the system to your situation. The Guide walks you through the Communication Protocol for a specific conflict, step by step, and helps you leave with a concrete plan. The Mentor is an expert on the whole system, so it can explain the framework, the protocol, the principles, and the tools, or help you build your own.',
  },
  {
    q: 'How is the Guide different from the Mentor?',
    a: 'Use the Guide when you have a real situation to work through and want a plan. Use the Mentor when you want to learn or think about the system itself. Both draw on the same source material, so they never contradict the framework.',
  },
  {
    q: 'Do I need an account to try it?',
    a: `No. You can send ${FREE_ANON_MESSAGES} messages with no account at all. Create a free account and you get ${FREE_ACCOUNT_MESSAGES} in total. These are a lifetime allowance, not monthly, so you can spend them whenever you actually need them.`,
  },
  {
    q: 'How much does a subscription cost?',
    a: `Unlimited conversations with both assistants are ${PLANS.monthly.priceLabel} a month, or ${PLANS.annual.priceLabel} a year (two months free). You can cancel yourself anytime, in two clicks.`,
  },
  {
    q: 'Are my conversations private?',
    a: 'Yes. They are stored in your own account and visible only to you. Nobody at Beanchain reads them, and they are not used to train models. You can delete any conversation, or your whole account, whenever you like.',
  },
  {
    q: 'Can I use this with my team or organization?',
    a: `Yes. Teams get a shared dashboard, assistants you can ground in your own documents and share organization-wide, and per-person private history. It suits co-ops, schools, nonprofits, and small companies. Team plans start at ${PLANS.team.priceLabel.replace(/^From /, '')} per person per month with a five-seat minimum.`,
  },
  {
    q: 'Can I put an assistant on my own domain?',
    a: 'Yes. With white-label pages you can serve a branded assistant on your own subdomain, with your logo and a sign-in that never leaves your brand. Setup is self-serve and takes minutes, with automatic HTTPS and no engineering required.',
  },
  {
    q: 'Who created the Solution Seeking System?',
    a: 'It is a Beanchain Process, created by David and Shannon Baxter of Beanchain Coffee. It grew out of running their own business and wanting a better, more democratic way to solve problems together.',
  },
];
