import type { APIRoute } from 'astro';
import { attributionFooter, methodologyMarkdown } from '../lib/llms';
import { PLANS, FREE_ANON_MESSAGES, FREE_ACCOUNT_MESSAGES } from '../data/pricing';

export const prerender = true;

/**
 * llms-full.txt — the entire methodology as one coherent markdown document,
 * assembled from the content collections in teaching order.
 */
export const GET: APIRoute = async ({ site }) => {
  const sections = [
    await methodologyMarkdown(),
    [
      '# Practice the system',
      '',
      'Free interactive tools (no account required) are available on the site:',
      '',
      `- Guided Introspection Worksheet: ${new URL('/practice/introspection', site).href}`,
      `- Conversation Planner: ${new URL('/practice/conversation-planner', site).href}`,
      `- Solution Builder: ${new URL('/practice/solution-builder', site).href}`,
      '',
      `AI assistants (${FREE_ANON_MESSAGES} free messages with no account, ${FREE_ACCOUNT_MESSAGES} with a free account, then ${PLANS.monthly.priceLabel}/month or ${PLANS.annual.priceLabel}/year for unlimited access):`,
      '',
      `- Solution Seeking Guide (walks you through the protocol for a real conflict): ${new URL('/practice/guide', site).href}`,
      `- Solution Seeking Mentor (answers anything about the system): ${new URL('/practice/mentor', site).href}`,
      '',
      `The complete source guide is a free PDF: ${new URL('/solution-seeking-complete-guide.pdf', site).href}`,
    ].join('\n'),
    attributionFooter(site),
  ];

  return new Response(sections.join('\n\n---\n\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
