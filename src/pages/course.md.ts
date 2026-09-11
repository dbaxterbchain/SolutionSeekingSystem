import type { APIRoute } from 'astro';
import { attributionFooter, courseToMarkdown } from '../lib/llms';
import { COURSE_STATUS } from '../data/course';
import { courseCopy } from '../lib/course/copy';
import { getCourseCatalog } from '../lib/course/catalog';
import { publicCurriculum } from '../lib/course/curriculum';

export const prerender = true;

/**
 * /course.md: the public shape of the paid video course as token-cheap
 * markdown for LLM agents. Advertised via the `markdownAlt` link on /course.
 * No page at all while the course is hidden, matching /course itself.
 */
export const GET: APIRoute = async ({ site }) => {
  if (COURSE_STATUS === 'hidden') return new Response(null, { status: 404 });

  const curriculum = publicCurriculum(await getCourseCatalog());
  const priceLine =
    COURSE_STATUS === 'open' ? courseCopy('{{course_price}} · {{access_summary}}') : null;

  const markdown = `${courseToMarkdown(site, curriculum, { status: COURSE_STATUS, priceLine })}\n\n${attributionFooter(site)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
