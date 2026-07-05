import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseAdmin';

/** Resolve the signed-in user from a request's `Authorization: Bearer <jwt>`. */
export async function getUserFromRequest(request: Request): Promise<User | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}

/** JSON response helper shared by the API routes. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
