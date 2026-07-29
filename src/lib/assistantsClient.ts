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
  /** The workspace it belongs to: null = Personal, else an org id. */
  org_id: string | null;
  /** Whether other members of org_id can see it (managers share). */
  shared: boolean;
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

/** '' for the Personal workspace, else `?org_id=<id>`. */
function orgQuery(orgId: string | null): string {
  return orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
}

/** Load the assistants in one workspace (null = Personal) plus the full membership list. */
export async function fetchAssistants(orgId: string | null): Promise<AssistantsData> {
  const res = await fetch(`/api/assistants${orgQuery(orgId)}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Could not load your assistants.');
  const data = await res.json().catch(() => null);
  return {
    mine: data?.mine ?? [],
    shared: data?.shared ?? [],
    memberships: data?.memberships ?? [],
  };
}

/**
 * A failed assistant action, keeping the server's error code (and any payload)
 * so callers can branch on it: e.g. `page_attached` carries the white-label
 * slugs that would be deleted along with the assistant.
 */
export class AssistantActionError extends Error {
  code?: string;
  slugs?: string[];

  constructor(message: string, code?: string, slugs?: string[]) {
    super(message);
    this.name = 'AssistantActionError';
    this.code = code;
    this.slugs = slugs;
  }
}

async function post(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/assistants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AssistantActionError(
      data?.message ?? assistantErrorMessage(data?.error),
      typeof data?.error === 'string' ? data.error : undefined,
      Array.isArray(data?.slugs) ? data.slugs : undefined
    );
  }
  return data ?? {};
}

/** Create in a workspace (null = Personal). New assistants are never auto-shared. */
export async function createAssistant(input: AssistantInput, orgId: string | null): Promise<string> {
  const data = await post({ action: 'create', ...input, org_id: orgId });
  return String(data.id ?? '');
}

export async function updateAssistant(id: string, input: AssistantInput): Promise<void> {
  await post({ action: 'update', id, ...input });
}

/** Copy an assistant (config + document links) into a new private draft. */
export async function duplicateAssistant(id: string): Promise<string> {
  const data = await post({ action: 'duplicate', id });
  return String(data.id ?? '');
}

/**
 * Delete an assistant. Without `confirm`, the server answers 409 `page_attached`
 * (with the page slugs) when white-label pages would be deleted along with it;
 * pass `confirm: true` after the user has accepted that.
 */
export async function deleteAssistant(id: string, opts?: { confirm?: boolean }): Promise<void> {
  await post({ action: 'delete', id, ...(opts?.confirm ? { confirm: true } : {}) });
}

/** Share within the assistant's own org workspace (managers only). */
export async function shareAssistant(id: string): Promise<void> {
  await post({ action: 'share', id });
}

export async function unshareAssistant(id: string): Promise<void> {
  await post({ action: 'unshare', id });
}

/** Move to another workspace (null = Personal). Resets sharing; org targets need a manager. */
export async function moveAssistant(id: string, orgId: string | null): Promise<void> {
  await post({ action: 'move', id, org_id: orgId });
}

function assistantErrorMessage(code?: string): string {
  switch (code) {
    case 'manager_required':
      return 'Only an organization manager can share assistants.';
    case 'role_restricted':
      return 'Your role in this organization does not allow that.';
    case 'too_many_assistants':
      return 'You have reached the 20-assistant limit.';
    case 'setup_too_large':
      return 'Those instructions and documents are too long together. Use fewer or shorter documents.';
    case 'page_attached':
      return 'This assistant powers a white-label page, so deleting it needs an extra confirmation.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
