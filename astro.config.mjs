// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.solutionseeking.com',
  // Static by default (fast, SEO-friendly). The Netlify adapter is wired up now
  // so Phase 3 AI endpoints can opt into on-demand rendering with
  // `export const prerender = false` without reconfiguring the project.
  adapter: netlify(),
  integrations: [tailwind(), react(), mdx()],
});
