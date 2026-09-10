// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

// The launch flag, read the way the build reads it (from .env files and the
// process environment) so the sitemap agrees with the pages.
const { PUBLIC_COURSE_STATUS = '' } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');
const coursePublic = PUBLIC_COURSE_STATUS === 'preview' || PUBLIC_COURSE_STATUS === 'open';

// https://astro.build/config
export default defineConfig({
  site: 'https://solutionseeking.com',
  // Static by default (fast, SEO-friendly). The Netlify adapter is wired up now
  // so Phase 3 AI endpoints can opt into on-demand rendering with
  // `export const prerender = false` without reconfiguring the project.
  adapter: netlify(),
  integrations: [
    tailwind(),
    react(),
    mdx(),
    sitemap({
      // Auth-gated, internal, and error pages carry no search value.
      filter: (page) =>
        !page.includes('/account') &&
        !page.includes('/admin') &&
        !page.includes('/dashboard') &&
        !page.includes('/saved') &&
        !page.includes('/course/learn') &&
        // The sales page 404s while hidden and writes no file; this keeps the
        // URL out of the sitemap even if that ever changes.
        (coursePublic || !page.includes('/course')) &&
        !page.includes('/404'),
    }),
  ],
});
