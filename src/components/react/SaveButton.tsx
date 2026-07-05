import { useState } from 'react';
import { useSession } from '../../lib/useSession';
import { isSupabaseConfigured } from '../../lib/supabase';
import { saveSession, type ToolType } from '../../lib/savedSessions';
import { useDialog } from './Dialog';

/**
 * "Save to my account" control shared by all three practice tools. When signed
 * in it prompts for a title and inserts a saved_sessions row; when signed out it
 * shows a quiet link to /account. Copy/download still work regardless — saving
 * is purely additive.
 */
export default function SaveButton({
  tool,
  data,
  summary,
  defaultTitle,
  className = 'btn-secondary',
}: {
  tool: ToolType;
  /** Called lazily on click so the latest tool state is captured. */
  data: () => Record<string, unknown>;
  summary: string;
  defaultTitle: string;
  className?: string;
}) {
  const { user, loading } = useSession();
  const { prompt, dialog } = useDialog();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  if (!isSupabaseConfigured || loading) return null;

  if (!user) {
    return (
      <a href="/account" className={className}>
        Sign in to save
      </a>
    );
  }

  const onSave = async () => {
    const title = await prompt({
      title: 'Save to your account',
      label: 'Name this so you can find it later',
      defaultValue: defaultTitle,
      placeholder: 'e.g. “Scheduling chat with Brian”',
      confirmLabel: 'Save',
    });
    if (title === null) return; // cancelled
    setStatus('saving');
    try {
      await saveSession({ tool, title, data: data(), summary });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <>
      <button type="button" onClick={onSave} disabled={status === 'saving'} className={className}>
        {status === 'saving'
          ? 'Saving…'
          : status === 'saved'
            ? 'Saved ✓'
            : status === 'error'
              ? 'Try again'
              : 'Save to my account'}
      </button>
      {dialog}
    </>
  );
}
