/**
 * Runtime lookup for server-only env vars. Bracket access keeps Vite from
 * inlining values into the build output at build time (Netlify's secrets
 * scanner flags inlined secret values, and inlined keys go stale on
 * rotation); process.env covers the Netlify Functions runtime.
 */
export function serverEnv(name: string): string {
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[name];
  return fromMeta ?? process.env[name] ?? '';
}
