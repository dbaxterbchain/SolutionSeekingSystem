import type { APIRoute } from 'astro';
import { requireAdmin, adminJson } from '../../../lib/server/adminAuth';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';

export const prerender = false;

/**
 * Feedback and testimonials.
 *
 * `ip_hash` is deliberately never selected. It is not useful here and this
 * response goes to a browser.
 */
const COLUMNS =
  'id, helpful, agent, context, message_count, display_name, role_title, quote, consent_publish, note, status, is_anonymous, chat_id, created_at';

export const GET: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);

  const { data, error } = await supabaseAdmin
    .from('testimonials')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('admin feedback list failed', error);
    return adminJson({ error: 'server_error' }, 500);
  }
  return adminJson({ rows: data ?? [] });
};

/** Approve or reject a testimonial. Approving is what makes a quote publishable. */
export const POST: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const status = body?.status;
  if (!id || (status !== 'approved' && status !== 'rejected' && status !== 'new')) {
    return adminJson({ error: 'invalid' }, 400);
  }

  const { error } = await supabaseAdmin.from('testimonials').update({ status }).eq('id', id);

  if (error) {
    // 23514 is the table's own check constraint refusing to approve a row that
    // has no consent or no quote. That is the database protecting a real person
    // from us, so it deserves a readable answer rather than a 500.
    if (error.code === '23514') {
      return adminJson(
        {
          error: 'not_publishable',
          message:
            'That cannot be approved: there is no quote, or the person did not consent to publication.',
        },
        409
      );
    }
    console.error('admin feedback update failed', error);
    return adminJson({ error: 'server_error' }, 500);
  }

  console.log('admin action', admin.email, 'testimonial', id, '->', status);
  return adminJson({ ok: true });
};
