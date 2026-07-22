import { supabase } from './supabase';
import type { AgentId } from './chatSessions';

export interface WhiteLabelPageView {
  id: string;
  org_id: string;
  slug: string;
  assistant_id: string | null;
  agent: AgentId | null;
  context: string | null;
  title: string;
  description: string;
  display_instructions: string;
  logo_path: string | null;
  logo_url: string | null;
  status: string;
  custom_domain: string | null;
  path: string;
  created_at: string;
}

export interface WhiteLabelInput {
  slug?: string;
  title: string;
  description: string;
  display_instructions: string;
  assistant_id: string | null;
  agent: AgentId | null;
  context: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchPages(
  orgId: string
): Promise<{ rows: WhiteLabelPageView[]; orgName: string | null }> {
  const res = await fetch(`/api/white-label?org_id=${encodeURIComponent(orgId)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Could not load your pages.');
  const data = await res.json().catch(() => null);
  return { rows: data?.rows ?? [], orgName: data?.orgName ?? null };
}

async function post(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/white-label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? pageErrorMessage(data?.error));
  return data ?? {};
}

export async function createPage(
  orgId: string,
  input: WhiteLabelInput
): Promise<{ id: string; path: string }> {
  const data = await post({ action: 'create', org_id: orgId, ...input });
  return { id: String(data.id ?? ''), path: String(data.path ?? '') };
}

export async function updatePage(orgId: string, id: string, input: WhiteLabelInput): Promise<void> {
  await post({ action: 'update', org_id: orgId, id, ...input });
}

export async function setPageStatus(
  orgId: string,
  id: string,
  status: 'active' | 'inactive'
): Promise<void> {
  await post({ action: 'set_status', org_id: orgId, id, status });
}

export async function deletePage(orgId: string, id: string): Promise<void> {
  await post({ action: 'delete', org_id: orgId, id });
}

export async function uploadLogo(pageId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('page_id', pageId);
  form.append('file', file);
  const res = await fetch('/api/white-label-logo', {
    method: 'POST',
    headers: await authHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? 'Could not upload that logo.');
  return String(data.logo_url ?? '');
}

function pageErrorMessage(code?: string): string {
  switch (code) {
    case 'slug_taken':
      return 'That address is already used in your organization.';
    case 'too_many_pages':
      return 'You have reached the 10-page limit.';
    case 'manager_required':
      return 'Only an organization manager can manage white-label pages.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
