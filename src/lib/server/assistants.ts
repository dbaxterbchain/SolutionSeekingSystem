import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseAdmin';
import { getOrgMemberships, isMemberOf } from './orgMembership';
import type { AgentId } from './agents';

/** Total setup-injection budget (~30k tokens): instructions + all knowledge docs. */
export const MAX_SETUP_CHARS = 120_000;
/** Knowledge documents an assistant may carry. */
export const MAX_ASSISTANT_DOCS = 5;

export interface AssistantRow {
  id: string;
  owner_user_id: string;
  org_id: string | null;
  name: string;
  base_agent: AgentId;
  context: string | null;
  instructions: string;
}

export interface AssistantDoc {
  document_id: string;
  position: number;
  name: string;
  text: string;
}

/**
 * Load an assistant the user is allowed to use, with its knowledge documents in
 * deterministic order. Access = owner, OR a member of the organization the
 * assistant is shared to. Returns null when the assistant doesn't exist or the
 * caller can't reach it, so the API can answer a non-probeable 404.
 */
export async function loadAssistantForUser(
  assistantId: string,
  user: User
): Promise<{ assistant: AssistantRow; docs: AssistantDoc[] } | null> {
  const { data: assistant, error } = await supabaseAdmin
    .from('assistants')
    .select('id, owner_user_id, org_id, name, base_agent, context, instructions')
    .eq('id', assistantId)
    .maybeSingle();
  if (error) {
    console.error('assistant lookup failed', error);
    return null;
  }
  if (!assistant) return null;

  if (assistant.owner_user_id !== user.id) {
    // Not the owner: allowed only if it's shared to an org they belong to.
    if (!assistant.org_id) return null;
    const memberships = await getOrgMemberships(user);
    if (!isMemberOf(memberships, assistant.org_id)) return null;
  }

  const { data: joins } = await supabaseAdmin
    .from('assistant_documents')
    .select('position, document_id, documents ( name, extracted_text )')
    .eq('assistant_id', assistantId)
    .order('position', { ascending: true })
    .order('document_id', { ascending: true });

  const docs: AssistantDoc[] = (joins ?? []).map((j) => {
    const d = j.documents as unknown as { name: string; extracted_text: string } | null;
    return {
      document_id: j.document_id,
      position: j.position,
      name: d?.name ?? 'document',
      text: d?.extracted_text ?? '',
    };
  });

  return { assistant: assistant as AssistantRow, docs };
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
