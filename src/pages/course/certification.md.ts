import type { APIRoute } from 'astro';
import { attributionFooter, certificationToMarkdown } from '../../lib/llms';
import { COURSE_STATUS } from '../../data/course';

export const prerender = true;

/**
 * /course/certification.md: the published rubric as token-cheap markdown
 * for LLM agents. Advertised via the `markdownAlt` link on
 * /course/certification. No page at all while the course is hidden.
 */
export const GET: APIRoute = ({ site }) => {
  if (COURSE_STATUS === 'hidden') return new Response(null, { status: 404 });

  const markdown = `${certificationToMarkdown(site)}\n\n${attributionFooter(site)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
