import { supabase } from './supabase';
import type { AgentId } from './server/agents';

export type { AgentId };

/** A document attached to a user message (id + display name; text lives server-side). */
export interface ChatAttachment {
  id: string;
  name: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Uploaded documents attached to this message (user messages only). */
  attachments?: ChatAttachment[];
}

export interface ChatSession {
  id: string;
  user_id: string;
  agent: AgentId;
  title: string;
  messages: ChatMessage[];
  /** Named context the conversation was started with (see src/lib/contexts.ts), if any. */
  context: string | null;
  /** The specialized assistant that drove this conversation, if any. */
  assistant_id: string | null;
  /** The workspace it belongs to: null = Personal, else an org id. */
  org_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Human labels + route for each assistant (used by the account page). */
export const AGENT_META: Record<AgentId, { label: string; path: string }> = {
  guide: { label: 'Solution Seeking Guide', path: '/practice/guide' },
  mentor: { label: 'Solution Seeking Mentor', path: '/practice/mentor' },
};

/**
 * List the signed-in user's conversations in one workspace (null = Personal), most
 * recently updated first. Scoping keeps another workspace's history out of view.
 */
export async function listChatSessions(orgId: string | null): Promise<ChatSession[]> {
  let query = supabase
    .from('chat_sessions')
    .select('*')
    .order('updated_at', { ascending: false });
  query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChatSession[];
}

/** Fetch one conversation by id (RLS restricts it to the owner). */
export async function getChatSession(id: string): Promise<ChatSession | null> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatSession) ?? null;
}

/** Create a conversation for the current user in a workspace (null = Personal). */
export async function createChatSession(input: {
  agent: AgentId;
  title: string;
  messages: ChatMessage[];
  context?: string | null;
  assistant_id?: string | null;
  org_id?: string | null;
}): Promise<ChatSession> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: user.id,
      agent: input.agent,
      title: input.title.trim() || 'Untitled',
      messages: input.messages,
      context: input.context ?? null,
      assistant_id: input.assistant_id ?? null,
      org_id: input.org_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ChatSession;
}

/** Update a conversation's messages (and optionally title). */
export async function updateChatSession(
  id: string,
  patch: { title?: string; messages: ChatMessage[] }
): Promise<void> {
  const { error } = await supabase.from('chat_sessions').update(patch).eq('id', id);
  if (error) throw error;
}

/** Delete one conversation by id. */
export async function deleteChatSession(id: string): Promise<void> {
  const { error } = await supabase.from('chat_sessions').delete().eq('id', id);
  if (error) throw error;
}
