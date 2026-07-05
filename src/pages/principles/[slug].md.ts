import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { attributionFooter, principleToMarkdown } from '../../lib/llms';

export const prerender = true;

export async function getStaticPaths() {
  const principles = await getCollection('principles');
  return principles.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const markdown = `${principleToMarkdown(props.entry)}\n\n${attributionFooter(site)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
