import { supabase } from './supabase';

/** Document metadata as returned by /api/documents (never the extracted text). */
export interface DocumentMeta {
  id: string;
  name: string;
  mime: string;
  size_bytes: number;
  char_count: number;
  truncated: boolean;
  created_at: string;
}

const BUCKET = 'documents';

/** Extension -> the Content-Type the storage bucket accepts. */
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};

export const ACCEPTED_EXTENSIONS = Object.keys(EXT_MIME);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const res = await fetch('/api/documents', { headers: await authHeaders() });
  if (!res.ok) throw new Error('Could not load your documents.');
  const data = await res.json().catch(() => null);
  return (data?.rows ?? []) as DocumentMeta[];
}

/**
 * Upload the file straight to storage (bypassing the ~6MB function body limit),
 * then ask the server to register and extract it. On any server-side failure the
 * just-uploaded object is removed so nothing is orphaned.
 */
export async function uploadAndRegister(file: File): Promise<DocumentMeta> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXT_MIME[ext]) {
    throw new Error('Unsupported file type. Use PDF, Word (.docx), .txt, or .md.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('That file is too large (10 MB maximum).');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: EXT_MIME[ext], upsert: false });
  if (upErr) {
    throw new Error(
      /exceeded|too large|413/i.test(upErr.message)
        ? 'That file is too large (10 MB maximum).'
        : 'Upload failed. Please check your connection and try again.'
    );
  }

  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ storage_path: path, name: file.name }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The server didn't register it: clean up the object we just uploaded.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(data?.message ?? registerErrorMessage(data?.error));
  }
  return data.document as DocumentMeta;
}

function registerErrorMessage(code?: string): string {
  switch (code) {
    case 'too_many_documents':
      return 'You have reached the 50-document limit. Delete one first.';
    case 'no_text_found':
      return 'That PDF looks scanned (no selectable text). Try a text-based file.';
    case 'subscription_required':
      return 'Documents are part of a subscription.';
    default:
      return 'Could not process that file. Please try another.';
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Could not delete that document.');
}
