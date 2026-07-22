import { supabase } from './supabase';
import type { AgentId } from './chatSessions';

export interface AssistantDocRef {
  id: string;
  name: string;
  char_count: number;
}

export interface Assistant {
  id: string;
  name: string;
  base_agent: AgentId;
  context: string | null;
  instructions: string;
  org_id: string | null;
  documents: AssistantDocRef[];
  created_at: string;
  updated_at: string;
}

export interface OrgMembershipView {
  orgId: string;
  orgName: string;
  role: 'member' | 'manager';
}

export interface AssistantsData {
  mine: Assistant[];
  shared: Assistant[];
  /** Every org the user belongs to (a person can be in several). */
  memberships: OrgMembershipView[];
}

export interface AssistantInput {
  name: string;
  base_agent: AgentId;
  context: string | null;
  instructions: string;
  document_ids: string[];
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAssistants(): Promise<AssistantsData> {
  const res = await fetch('/api/assistants', { headers: await authHeaders() });
  if (!res.ok) throw new Error('Could not load your assistants.');
  const data = await res.json().catch(() => null);
  return {
    mine: data?.mine ?? [],
    shared: data?.shared ?? [],
    memberships: data?.memberships ?? [],
  };
}

async function post(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/assistants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? assistantErrorMessage(data?.error));
  return data ?? {};
}

export async function createAssistant(input: AssistantInput): Promise<string> {
  const data = await post({ action: 'create', ...input });
  return String(data.id ?? '');
}

export async function updateAssistant(id: string, input: AssistantInput): Promise<void> {
  await post({ action: 'update', id, ...input });
}

export async function deleteAssistant(id: string): Promise<void> {
  await post({ action: 'delete', id });
}

export async function shareAssistant(id: string, orgId: string): Promise<void> {
  await post({ action: 'share', id, org_id: orgId });
}

export async function unshareAssistant(id: string): Promise<void> {
  await post({ action: 'unshare', id });
}

function assistantErrorMessage(code?: string): string {
  switch (code) {
    case 'manager_required':
      return 'Only an organization manager can share assistants.';
    case 'too_many_assistants':
      return 'You have reached the 20-assistant limit.';
    case 'setup_too_large':
      return 'Those instructions and documents are too long together. Use fewer or shorter documents.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
