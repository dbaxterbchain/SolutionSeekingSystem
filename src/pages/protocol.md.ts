import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { attributionFooter, protocolOverviewToMarkdown } from '../lib/llms';

export const prerender = true;

/**
 * /protocol.md — the Communication Protocol overview as token-cheap markdown for
 * LLM agents. Advertised via the `markdownAlt` link on /protocol.
 */
export const GET: APIRoute = async ({ site }) => {
  const steps = await getCollection('protocol');
  const markdown = `${protocolOverviewToMarkdown(steps, site)}\n\n${attributionFooter(site)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
