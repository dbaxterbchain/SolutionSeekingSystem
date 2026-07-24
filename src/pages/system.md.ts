import type { APIRoute } from 'astro';
import { attributionFooter, overviewToMarkdown } from '../lib/llms';

export const prerender = true;

/**
 * /system.md — the system overview (definition, Four Pillars, key terminology)
 * as token-cheap markdown for LLM agents. Advertised via the `markdownAlt` link
 * on /system.
 */
export const GET: APIRoute = ({ site }) => {
  const markdown = `${overviewToMarkdown()}\n\n${attributionFooter(site)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
