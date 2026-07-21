import type { APIRoute } from 'astro';
import { json } from '../../lib/server/auth';
import { requireSubscriber } from '../../lib/server/subscriberAuth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { extractText, UnsupportedContentError, type DocExt } from '../../lib/server/extractText';

export const prerender = false;

const MAX_DOCS_PER_USER = 50;
const BUCKET = 'documents';
/** Columns returned to the browser: never `extracted_text` or `storage_path`. */
const LIST_COLUMNS = 'id, name, mime, size_bytes, char_count, truncated, created_at';

/** List the subscriber's documents (metadata only, never the extracted text). */
export const GET: APIRoute = async ({ request }) => {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return json({ error: auth.error }, auth.status);

  const { data, error } = await supabaseAdmin
    .from('documents')
    .select(LIST_COLUMNS)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('documents list failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ rows: data ?? [] });
};

/**
 * Register a file the client already uploaded to storage: download it, extract
 * its text, and store the row. Body: { storage_path, name }.
 */
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return json({ error: auth.error }, auth.status);
  const { user } = auth;

  const body = (await request.json().catch(() => null)) as
    | { storage_path?: unknown; name?: unknown }
    | null;
  const storagePath = typeof body?.storage_path === 'string' ? body.storage_path : '';
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : '';
  // The path must be THIS user's own folder: '<user_id>/<uuid>.<ext>'. This is the
  // server-side mirror of the storage RLS policy, so a forged path can't register
  // someone else's object.
  const pathOk = new RegExp(`^${user.id}/[0-9a-fA-F-]{36}\\.(pdf|docx|txt|md)$`).test(storagePath);
  if (!pathOk || !name) return json({ error: 'bad_request' }, 400);

  const { count } = await supabaseAdmin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((count ?? 0) >= MAX_DOCS_PER_USER) {
    return json(
      { error: 'too_many_documents', message: `You have reached the ${MAX_DOCS_PER_USER}-document limit.` },
      409
    );
  }

  const { data: blob, error: dlError } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (dlError || !blob) {
    console.error('document download failed', dlError);
    return json({ error: 'object_missing' }, 404);
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  const ext = storagePath.slice(storagePath.lastIndexOf('.') + 1).toLowerCase() as DocExt;

  let extraction;
  try {
    extraction = await extractText(buffer, ext);
  } catch (err) {
    // Failed to read: delete the orphaned object rather than leave it dangling.
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    if (err instanceof UnsupportedContentError) {
      return json({ error: 'no_text_found', message: err.message }, 422);
    }
    console.error('extraction failed', err);
    return json(
      { error: 'extraction_failed', message: 'Could not read that file. Please try another.' },
      422
    );
  }

  const { data, error } = await supabaseAdmin
    .from('documents')
    .insert({
      user_id: user.id,
      name,
      storage_path: storagePath,
      mime: blob.type || 'application/octet-stream',
      size_bytes: buffer.length,
      char_count: extraction.text.length,
      extracted_text: extraction.text,
      truncated: extraction.truncated,
    })
    .select(LIST_COLUMNS)
    .single();
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    if ((error as { code?: string }).code === '23505') {
      return json({ error: 'already_registered' }, 409);
    }
    console.error('document insert failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ document: data });
};

/** Delete a document (row + storage object). Query: ?id=<uuid>. */
export const DELETE: APIRoute = async ({ request }) => {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return json({ error: auth.error }, auth.status);

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return json({ error: 'bad_request' }, 400);

  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!doc) return json({ error: 'not_found' }, 404);

  const { error } = await supabaseAdmin
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.user.id);
  if (error) {
    console.error('document delete failed', error);
    return json({ error: 'server_error' }, 500);
  }
  // Storage removal is best-effort: the row is the source of truth, and a stray
  // object is harmless (and swept up if we ever reconcile).
  await supabaseAdmin.storage
    .from(BUCKET)
    .remove([doc.storage_path])
    .catch((e) => console.error('storage remove failed', e));
  return json({ ok: true });
};
