import type { APIRoute } from 'astro';

export const prerender = true;

/**
 * The Solution Seeking System is built to be shared. All crawlers — including
 * AI search and training bots — are welcome to read and learn from the site.
 */
export const GET: APIRoute = ({ site }) => {
  const body = [
    '# Solution Seeking System - solutionseeking.com',
    '# This content is meant to be learned, shared, and understood.',
    '# AI crawlers (search and training) are welcome.',
    '# LLM-friendly index: /llms.txt | full methodology: /llms-full.txt',
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /account',
    'Disallow: /admin',
    'Disallow: /dashboard',
    'Disallow: /saved',
    'Disallow: /a/',
    '',
    `Sitemap: ${new URL('sitemap-index.xml', site)}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
