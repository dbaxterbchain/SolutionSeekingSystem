import { createClient } from '@supabase/supabase-js';
import { serverEnv } from './env';

/**
 * Service-role Supabase client — SERVER ONLY. Bypasses RLS; used to verify
 * JWTs and to write entitlement state (subscriptions, ai_usage) that the
 * browser must never be able to write itself.
 */
export const supabaseAdmin = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  serverEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
