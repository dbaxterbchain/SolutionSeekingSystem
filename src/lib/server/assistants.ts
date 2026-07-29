import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseAdmin';
import { getOrgMemberships, getMembership, type OrgMembership } from './orgMembership';
import type { AgentId } from './agents';

/** Total setup-injection budget (~30k tokens): instructions + all knowledge docs. */
export const MAX_SETUP_CHARS = 120_000;
/** Knowledge documents an assistant may carry. */
export const MAX_ASSISTANT_DOCS = 5;

export interface AssistantRow {
  id: string;
  owner_user_id: string;
  org_id: string | null;
  shared: boolean;
  name: string;
  base_agent: AgentId;
  context: string | null;
  instructions: string;
  is_template: boolean;
  template_id: string | null;
}

export interface AssistantDoc {
  document_id: string;
  position: number;
  name: string;
  text: string;
}

/** An assistant's knowledge documents in deterministic order. */
async function loadDocsFor(assistantId: string): Promise<AssistantDoc[]> {
  const { data: joins } = await supabaseAdmin
    .from('assistant_documents')
    .select('position, document_id, documents ( name, extracted_text )')
    .eq('assistant_id', assistantId)
    .order('position', { ascending: true })
    .order('document_id', { ascending: true });

  return (joins ?? []).map((j) => {
    const d = j.documents as unknown as { name: string; extracted_text: string } | null;
    return {
      document_id: j.document_id,
      position: j.position,
      name: d?.name ?? 'document',
      text: d?.extracted_text ?? '',
    };
  });
}

/**
 * Whether this user may USE (chat with) the assistant: owner, org-wide share
 * for a member/manager seat, or a specific share for their seat. The single
 * access rule, shared by the chat gate and template instantiation.
 */
export async function canUseAssistant(
  assistant: { id: string; owner_user_id: string; org_id: string | null; shared: boolean },
  user: User,
  memberships: OrgMembership[]
): Promise<boolean> {
  if (assistant.owner_user_id === user.id) return true;
  if (!assistant.org_id) return false;
  const membership = getMembership(memberships, assistant.org_id);
  if (!membership) return false;
  // Org-wide sharing deliberately excludes client seats.
  if (assistant.shared && membership.role !== 'client') return true;
  const { count } = await supabaseAdmin
    .from('assistant_shares')
    .select('assistant_id', { count: 'exact', head: true })
    .eq('assistant_id', assistant.id)
    .eq('member_id', membership.memberId);
  return Boolean(count);
}

export interface LoadedAssistant {
  assistant: AssistantRow;
  docs: AssistantDoc[];
  /**
   * The composed setup inputs for buildAssistantSetup: when the assistant is
   * built on a template, the template's instructions and documents come first
   * and the assistant's own layer on top. Otherwise identical to the
   * assistant's own instructions and docs.
   */
  setupInstructions: string;
  setupDocs: AssistantDoc[];
}

/**
 * Load an assistant the user is allowed to use, with its knowledge documents in
 * deterministic order. Access = owner, OR org-wide share (org_id set, shared =
 * true) for a member/manager seat in that org, OR a per-seat assistant_shares
 * row (the only arm that reaches a client seat). A private draft that merely
 * lives in an org workspace stays owner-only. Returns null when the assistant
 * doesn't exist or the caller can't reach it, so the API can answer a
 * non-probeable 404.
 *
 * Template composition happens here so /api/chat stays one call: a child
 * inherits its template's setup, but ONLY while template and child share a
 * workspace and, for org workspaces, the caller still holds a seat there. An
 * ex-member chatting an org child of their own stops receiving the org's
 * template content. Deterministic per (user, database state), so the prompt
 * cache still hits; editing the template intentionally rolls children's
 * entries.
 */
export async function loadAssistantForUser(
  assistantId: string,
  user: User
): Promise<LoadedAssistant | null> {
  const { data: assistant, error } = await supabaseAdmin
    .from('assistants')
    .select(
      'id, owner_user_id, org_id, shared, name, base_agent, context, instructions, is_template, template_id'
    )
    .eq('id', assistantId)
    .maybeSingle();
  if (error) {
    console.error('assistant lookup failed', error);
    return null;
  }
  if (!assistant) return null;

  let memberships: OrgMembership[] | null = null;
  const loadMemberships = async () => {
    if (memberships === null) memberships = await getOrgMemberships(user);
    return memberships;
  };

  if (assistant.owner_user_id !== user.id) {
    if (!assistant.org_id) return null;
    if (!(await canUseAssistant(assistant, user, await loadMemberships()))) return null;
  }

  const docs = await loadDocsFor(assistantId);

  let setupInstructions: string = assistant.instructions;
  let setupDocs: AssistantDoc[] = docs;
  if (assistant.template_id) {
    const { data: template } = await supabaseAdmin
      .from('assistants')
      .select('id, org_id, is_template, instructions')
      .eq('id', assistant.template_id)
      .maybeSingle();
    let included = Boolean(
      template && template.is_template && (template.org_id ?? null) === (assistant.org_id ?? null)
    );
    if (included && assistant.org_id) {
      included = Boolean(getMembership(await loadMemberships(), assistant.org_id));
    }
    if (included && template) {
      const templateDocs = await loadDocsFor(template.id);
      const inherited = new Set(templateDocs.map((d) => d.document_id));
      setupInstructions = [template.instructions.trim(), assistant.instructions.trim()]
        .filter(Boolean)
        .join('\n\n');
      setupDocs = [...templateDocs, ...docs.filter((d) => !inherited.has(d.document_id))];
    }
  }

  return { assistant: assistant as AssistantRow, docs, setupInstructions, setupDocs };
}

/**
 * The setup string injected once at the head of an assistant's conversations
 * (cache_control'd in chatMessages.ts). It MUST be byte-deterministic for a
 * given assistant + documents so the prompt cache hits on every message after
 * the first; editing an assistant intentionally rolls its cache entry. No
 * timestamps, no per-request data, documents in a fixed order.
 */
export function buildAssistantSetup(instructions: string, docs: AssistantDoc[]): string {
  const parts: string[] = ['<assistant_setup>'];
  const trimmed = instructions.trim();
  if (trimmed) parts.push(`<instructions>\n${trimmed}\n</instructions>`);
  for (const doc of docs) {
    const name = doc.name.replace(/[\r\n"]/g, ' ').slice(0, 200);
    parts.push(`<document name="${name}">\n${doc.text}\n</document>`);
  }
  parts.push('</assistant_setup>');

  const setup = parts.join('\n');
  if (setup.length <= MAX_SETUP_CHARS) return setup;
  // The API enforces the budget at write time, so this is a defensive backstop;
  // slicing keeps determinism (same inputs -> same output).
  console.warn(`assistant setup exceeded ${MAX_SETUP_CHARS} chars (${setup.length}); truncating`);
  return setup.slice(0, MAX_SETUP_CHARS);
}
