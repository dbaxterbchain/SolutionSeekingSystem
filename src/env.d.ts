/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  /** Course launch flag: hidden (default) | preview | open. See src/lib/course/status.ts. */
  readonly PUBLIC_COURSE_STATUS?: string;
  // Phase 3 — server-side only (never exposed to the browser).
  readonly ANTHROPIC_API_KEY: string;
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_WEBHOOK_SECRET: string;
  readonly STRIPE_PRICE_ID: string;
  /** The course's one-time price; see src/lib/server/course/offer.ts. */
  readonly STRIPE_PRICE_ID_COURSE?: string;
  /** Cloudflare Stream, for the course videos; see src/lib/server/course/stream.ts. */
  readonly CLOUDFLARE_STREAM_API_TOKEN?: string;
  readonly CLOUDFLARE_STREAM_CUSTOMER_CODE?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
