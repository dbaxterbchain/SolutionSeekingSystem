import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { attributionFooter, demoToMarkdown } from '../../../lib/llms';

export const prerender = true;

export async function getStaticPaths() {
  const demos = await getCollection('demos');
  return demos.map((entry) => ({ params: { demo: entry.id }, props: { entry } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const markdown = `${demoToMarkdown(props.entry, site)}\n\n${attributionFooter(site)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
