import type { APIRoute } from 'astro';
import { json } from '../../lib/server/auth';
import { requireSubscriber } from '../../lib/server/subscriberAuth';
import { getOrgMembership } from '../../lib/server/orgMembership';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';

export const prerender = false;

const BUCKET = 'branding';
const MAX_BYTES = 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Upload a page logo. Multipart form (page_id + file), manager-only. The file is
 * small (<=1 MB), so it rides through the function body, unlike documents. The
 * server writes it to the public `branding` bucket under the org's folder.
 */
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return json({ error: auth.error }, auth.status);
  const org = await getOrgMembership(auth.user.id);
  if (!org || org.role !== 'manager') return json({ error: 'manager_required' }, 403);

  const form = await request.formData().catch(() => null);
  const pageId = String(form?.get('page_id') ?? '');
  const file = form?.get('file');
  if (!pageId || !(file instanceof File)) return json({ error: 'bad_request' }, 400);

  const ext = MIME_EXT[file.type];
  if (!ext) return json({ error: 'bad_type', message: 'Use a PNG, JPG, or WebP image.' }, 415);
  if (file.size > MAX_BYTES) return json({ error: 'too_large', message: 'The logo must be under 1 MB.' }, 413);

  // The page must belong to this manager's organization.
  const { data: page } = await supabaseAdmin
    .from('white_label_pages')
    .select('id, org_id, logo_path')
    .eq('id', pageId)
    .maybeSingle();
  if (!page || page.org_id !== org.orgId) return json({ error: 'not_found' }, 404);

  const path = `${org.orgId}/${pageId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) {
    console.error('logo upload failed', upErr);
    return json({ error: 'server_error' }, 500);
  }
  // A changed extension leaves the old object behind; remove it.
  if (page.logo_path && page.logo_path !== path) {
    await supabaseAdmin.storage.from(BUCKET).remove([page.logo_path]).catch(() => {});
  }
  await supabaseAdmin.from('white_label_pages').update({ logo_path: path }).eq('id', pageId);

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return json({ logo_url: data.publicUrl });
};
