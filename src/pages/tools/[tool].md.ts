import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { attributionFooter, toolToMarkdown } from '../../lib/llms';

export const prerender = true;

export async function getStaticPaths() {
  const tools = await getCollection('tools');
  return tools.map((entry) => ({ params: { tool: entry.id }, props: { entry } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const markdown = `${toolToMarkdown(props.entry)}\n\n${attributionFooter(site)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
