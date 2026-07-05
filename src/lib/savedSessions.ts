import { supabase } from './supabase';

/** The three practice tools, matched to the `tool` CHECK constraint in the DB. */
export type ToolType = 'introspection' | 'planner' | 'solution';

export interface SavedSession {
  id: string;
  user_id: string;
  tool: ToolType;
  title: string;
  data: Record<string, unknown>;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface SaveInput {
  tool: ToolType;
  title: string;
  data: Record<string, unknown>;
  summary: string;
}

/** Human labels + practice route for each tool (used by the account library). */
export const TOOL_META: Record<ToolType, { label: string; path: string }> = {
  introspection: { label: 'Introspection', path: '/practice/introspection' },
  planner: { label: 'Conversation Plan', path: '/practice/conversation-planner' },
  solution: { label: 'Solution Check', path: '/practice/solution-builder' },
};

/** List the signed-in user's saved sessions, newest first (optionally by tool). */
export async function listSessions(tool?: ToolType): Promise<SavedSession[]> {
  let query = supabase
    .from('saved_sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (tool) query = query.eq('tool', tool);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SavedSession[];
}

/** Fetch a single saved session by id (RLS restricts it to the owner). */
export async function getSession(id: string): Promise<SavedSession | null> {
  const { data, error } = await supabase
    .from('saved_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as SavedSession) ?? null;
}

/** Insert a new saved session for the current user. */
export async function saveSession(input: SaveInput): Promise<SavedSession> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to save.');

  const { data, error } = await supabase
    .from('saved_sessions')
    .insert({
      user_id: user.id,
      tool: input.tool,
      title: input.title.trim() || 'Untitled',
      data: input.data,
      summary: input.summary,
    })
    .select()
    .single();
  if (error) throw error;
  return data as SavedSession;
}

/** Delete one saved session by id. */
export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('saved_sessions').delete().eq('id', id);
  if (error) throw error;
}
