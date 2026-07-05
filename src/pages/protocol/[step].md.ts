import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { attributionFooter, protocolToMarkdown } from '../../lib/llms';

export const prerender = true;

export async function getStaticPaths() {
  const steps = await getCollection('protocol');
  return steps.map((entry) => ({ params: { step: entry.id }, props: { entry } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const markdown = `${protocolToMarkdown(props.entry)}\n\n${attributionFooter(site)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
