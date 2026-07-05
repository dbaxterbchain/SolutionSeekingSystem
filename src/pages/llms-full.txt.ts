import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  attributionFooter,
  overviewToMarkdown,
  principleToMarkdown,
  protocolToMarkdown,
  toolToMarkdown,
} from '../lib/llms';

export const prerender = true;

/**
 * llms-full.txt — the entire methodology as one coherent markdown document,
 * assembled from the content collections in teaching order.
 */
export const GET: APIRoute = async ({ site }) => {
  const protocol = (await getCollection('protocol')).sort((a, b) => a.data.step - b.data.step);
  const principles = (await getCollection('principles')).sort(
    (a, b) => a.data.order - b.data.order
  );
  const tools = (await getCollection('tools')).sort((a, b) => a.data.order - b.data.order);

  const sections = [
    overviewToMarkdown(),
    [
      '# The Communication Protocol',
      '',
      'The three-step communication pattern at the core of the system. Worked in order,',
      'the steps replace reactive, adversarial conversations with a structured, respectful',
      'path from conflict to understanding to actionable results.',
    ].join('\n'),
    ...protocol.map(protocolToMarkdown),
    [
      '# The 12 Wisdom Principles',
      '',
      'The "source code" of the system: ethical values that guide how the Communication',
      'Protocol is applied. Each principle is documented in the same six-part format.',
    ].join('\n'),
    ...principles.map(principleToMarkdown),
    [
      '# The 4 Leadership Tools',
      '',
      'Practices that apply the Communication Protocol to real-world situations in teams,',
      'workplaces, relationships, and communities.',
    ].join('\n'),
    ...tools.map(toolToMarkdown),
    [
      '# Practice the system',
      '',
      'Free interactive tools (no account required) are available on the site:',
      '',
      `- Guided Introspection Worksheet: ${new URL('/practice/introspection', site).href}`,
      `- Conversation Planner: ${new URL('/practice/conversation-planner', site).href}`,
      `- Solution Builder: ${new URL('/practice/solution-builder', site).href}`,
      '',
      `The complete source guide is a free PDF: ${new URL('/solution-seeking-complete-guide.pdf', site).href}`,
    ].join('\n'),
    attributionFooter(site),
  ];

  return new Response(sections.join('\n\n---\n\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
