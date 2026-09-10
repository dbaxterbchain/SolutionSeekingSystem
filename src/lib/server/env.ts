/**
 * Runtime lookup for server-only env vars. Bracket access keeps Vite from
 * inlining values into the build output at build time (Netlify's secrets
 * scanner flags inlined secret values, and inlined keys go stale on
 * rotation); process.env covers the Netlify Functions runtime.
 *
 * `import.meta.env` is undefined in a plain Netlify function bundle (the
 * course grading worker), so it is read defensively.
 */
export function serverEnv(name: string): string {
  const meta = (import.meta as { env?: Record<string, string | undefined> }).env;
  return meta?.[name] ?? process.env[name] ?? '';
}
