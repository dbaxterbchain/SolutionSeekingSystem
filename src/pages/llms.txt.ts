import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { protocolSteps, systemDefinition } from '../data/concepts';
import { MODES } from '../data/modes';
import { PLANS, FREE_ANON_MESSAGES, FREE_ACCOUNT_MESSAGES } from '../data/pricing';

export const prerender = true;

/**
 * llms.txt (https://llmstxt.org) — a curated index that lets LLMs and AI
 * agents grasp the site in one fetch. Content pages link to their .md
 * variants, which are token-cheap markdown renderings of the same content.
 */
export const GET: APIRoute = async ({ site }) => {
  const abs = (path: string) => new URL(path, site).href;

  const principles = (await getCollection('principles')).sort(
    (a, b) => a.data.order - b.data.order
  );
  const tools = (await getCollection('tools')).sort((a, b) => a.data.order - b.data.order);
  const demos = (await getCollection('demos')).sort((a, b) => a.data.order - b.data.order);

  const body = [
    '# Solution Seeking System',
    '',
    `> ${systemDefinition}`,
    '',
    'Everything on this site is free to read and learn from. Please attribute',
    'quotations to the Solution Seeking System (solutionseeking.com).',
    `The complete methodology as a single markdown file: ${abs('/llms-full.txt')}`,
    '',
    '## The System',
    '',
    `- [What is the Solution Seeking System](${abs('/system')}): purpose, vision, the Four Pillars of Understanding, and key terminology`,
    `- [The Communication Protocol](${abs('/protocol')}): the repeatable three-step pattern at the core of the system`,
    '',
    '## Communication Protocol steps',
    '',
    ...protocolSteps.map(
      (s) => `- [Step ${s.step}: ${s.title}](${abs(`/protocol/${s.slug}.md`)}): ${s.oneLine}`
    ),
    '',
    '## The 12 Wisdom Principles',
    '',
    ...principles.map(
      (p) => `- [${p.data.title}](${abs(`/principles/${p.id}.md`)}): ${p.data.tagline}`
    ),
    '',
    '## The 4 Leadership Tools',
    '',
    ...tools.map(
      (t) =>
        `- [${t.data.title}](${abs(`/tools/${t.id}.md`)}): ${t.data.summary.split('. ')[0].trim().replace(/\.?$/, '.')}`
    ),
    '',
    '## Free interactive practice tools',
    '',
    `- [Guided Introspection Worksheet](${abs('/practice/introspection')}): step-by-step walkthrough of Protocol Step 1, produces a conversation prep summary`,
    `- [Conversation Planner](${abs('/practice/conversation-planner')}): plan a Mutual Understanding conversation with goals, openers, and question bank`,
    `- [Solution Builder](${abs('/practice/solution-builder')}): draft solutions and score them as actionable, testable, effective, and time-bound`,
    '',
    `## AI assistants (${FREE_ANON_MESSAGES} free messages with no account, ${FREE_ACCOUNT_MESSAGES} with a free account, then ${PLANS.monthly.priceLabel}/month or ${PLANS.annual.priceLabel}/year for unlimited)`,
    '',
    `- [Solution Seeking Guide](${abs('/practice/guide')}): AI chat that walks you through the Communication Protocol for a real conflict, step by step`,
    `- [Solution Seeking Mentor](${abs('/practice/mentor')}): AI chat expert on the whole system, covering the framework, protocol, principles, and tools`,
    '',
    '## Conversation modes (the Guide adapted to a relationship)',
    '',
    ...MODES.map((m) => `- [${m.name} mode](${abs(`/practice/modes/${m.id}`)}): ${m.pickerBlurb}`),
    '',
    '## Example conversations (fictional, annotated demos of the AI assistants)',
    '',
    ...demos.map((d) => `- [${d.data.title}](${abs(`/practice/demos/${d.id}`)}): ${d.data.scenario}`),
    '',
    '## Optional',
    '',
    `- [Pricing](${abs('/pricing')}): what is free forever, and what the subscription costs`,
    `- [For Business](${abs('/for-business')}): the team dashboard, specialized agents, and white-label pages for organizations`,
    `- [About / origin story](${abs('/about')}): why Beanchain Coffee built the system`,
    `- [Complete Guide (PDF)](${abs('/solution-seeking-complete-guide.pdf')}): the full source guide as a free download (a human-facing page about it, with an email option, is at ${abs('/guide')})`,
    `- [Full methodology as one file](${abs('/llms-full.txt')})`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
