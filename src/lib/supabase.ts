import { createClient } from '@supabase/supabase-js';

/**
 * Singleton Supabase browser client. The URL and publishable ("anon") key are
 * safe to expose to the client — data is protected by Row-Level Security on the
 * server (see supabase/migrations). The single instance keeps one auth session
 * in localStorage, so every React island shares the same signed-in state.
 */

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

/** True when the two PUBLIC_ env vars are present, so UI can degrade gracefully. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase env vars missing. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in .env.'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
