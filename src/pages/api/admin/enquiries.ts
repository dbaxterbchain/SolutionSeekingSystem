import type { APIRoute } from 'astro';
import { requireAdmin, adminJson } from '../../../lib/server/adminAuth';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';

export const prerender = false;

/** Team enquiries from /for-business. `ip_hash` is never selected. */
const COLUMNS = 'id, name, email, team_size, note, handled, created_at';

export const GET: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);

  const { data, error } = await supabaseAdmin
    .from('team_enquiries')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('admin enquiries list failed', error);
    return adminJson({ error: 'server_error' }, 500);
  }
  return adminJson({ rows: data ?? [] });
};

/** Mark an enquiry handled, so the list is a queue and not a graveyard. */
export const POST: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id || typeof body?.handled !== 'boolean') return adminJson({ error: 'invalid' }, 400);

  const { error } = await supabaseAdmin
    .from('team_enquiries')
    .update({ handled: body.handled })
    .eq('id', id);

  if (error) {
    console.error('admin enquiry update failed', error);
    return adminJson({ error: 'server_error' }, 500);
  }

  console.log('admin action', admin.email, 'enquiry', id, 'handled =', body.handled);
  return adminJson({ ok: true });
};
