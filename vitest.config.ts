import { defineConfig } from 'vitest/config';

// Pure course modules only. Nothing under test may import astro:content,
// Supabase, Stripe, Resend, or call fetch; those paths are verified by the
// build and by browser walkthroughs (CLAUDE.md, "Verifying features").
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/course/__tests__/**/*.test.ts',
      'src/lib/server/course/__tests__/**/*.test.ts',
    ],
  },
});
