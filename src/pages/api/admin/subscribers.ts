import type { APIRoute } from 'astro';
import { requireAdmin, adminJson } from '../../../lib/server/adminAuth';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';

export const prerender = false;

/**
 * The email list.
 *
 * `token` is NEVER selected, and this is not fussiness. The token is a
 * capability: whoever holds it can confirm or unsubscribe that address without
 * any other credential (/api/confirm, /api/unsubscribe). Shipping it to a
 * browser to render a table nobody reads it in would hand out that power for
 * nothing. `ip_hash` is likewise never selected.
 */
const COLUMNS = 'id, email, source, status, confirmed_at, created_at';

export const GET: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);

  const { data, error } = await supabaseAdmin
    .from('email_subscribers')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('admin subscribers list failed', error);
    return adminJson({ error: 'server_error' }, 500);
  }

  const rows = data ?? [];
  // Which capture point actually converts. The whole reason `source` records
  // first touch and is never overwritten.
  const bySource: Record<string, { total: number; confirmed: number }> = {};
  for (const r of rows) {
    const s = (r.source as string) ?? 'unknown';
    bySource[s] ??= { total: 0, confirmed: 0 };
    bySource[s].total += 1;
    if (r.status === 'confirmed') bySource[s].confirmed += 1;
  }

  return adminJson({ rows, bySource });
};
