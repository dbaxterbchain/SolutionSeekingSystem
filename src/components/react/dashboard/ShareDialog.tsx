import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchOrg, type OrgMemberView } from '../../../lib/orgClient';
import {
  shareAssistant,
  unshareAssistant,
  setAssistantShares,
  type Assistant,
} from '../../../lib/assistantsClient';

/**
 * Sharing controls for one assistant in an org workspace (managers only):
 * the org-wide flag plus specific per-seat shares. Org-wide reaches member
 * and manager seats; a specific share is the only way to reach a client seat,
 * and it works even before an invited email signs in for the first time.
 */
export default function ShareDialog({
  assistant,
  orgId,
  orgName,
  owned,
  onClose,
  onSaved,
}: {
  assistant: Assistant;
  orgId: string;
  orgName: string | null;
  /** Only the owner can change the org-wide flag (server rule). */
  owned: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [members, setMembers] = useState<OrgMemberView[] | null>(null);
  const [orgWide, setOrgWide] = useState(assistant.shared);
  const [checked, setChecked] = useState<Set<string>>(new Set(assistant.member_share_ids));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrg(orgId)
      .then((v) => setMembers(v.members))
      .catch(() => setError('Could not load the member list. Close this and try again.'));
  }, [orgId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const toggleSeat = (id: string) => {
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (owned) {
        if (orgWide && !assistant.shared) await shareAssistant(assistant.id);
        else if (!orgWide && assistant.shared) await unshareAssistant(assistant.id);
      }
      await setAssistantShares(assistant.id, [...checked]);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const roleChip = (role: string) =>
    role === 'manager' ? 'Manager' : role === 'client' ? 'Client' : 'Member';

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink-800/50 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sharing for ${assistant.name}`}
        className="my-8 w-full max-w-md rounded-3xl bg-white p-6 shadow-card-hover"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="truncate font-heading text-xl font-bold text-ink-800">
            Share "{assistant.name}"
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
              owned ? 'cursor-pointer border-slate-200 hover:border-brand-300' : 'border-slate-100 bg-slate-50/60'
            }`}
          >
            <input
              type="checkbox"
              checked={orgWide}
              disabled={!owned || busy}
              onChange={(e) => setOrgWide(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-semibold text-ink-800">
                Everyone in {orgName ?? 'this organization'}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                All members and managers can use it. Clients are not included.
                {!owned && ' Only the owner can change this.'}
              </span>
            </span>
          </label>

          <div>
            <p className="text-sm font-semibold text-ink-800">Specific people</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Selected people can use it even when it is not shared with everyone. This is the
              only way to share with a client.
            </p>
            {members === null && !error && (
              <p className="mt-2 text-sm text-slate-400">Loading members…</p>
            )}
            {members !== null && members.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">No members yet. Add people in Organization settings first.</p>
            )}
            {members !== null && members.length > 0 && (
              <div className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 p-1">
                {members.map((m) => {
                  const on = checked.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleSeat(m.id)}
                      disabled={busy}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                        on ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span aria-hidden="true">{on ? '☑' : '☐'}</span>
                      <span className="truncate">
                        {m.email}
                        {m.is_self && <span className="text-slate-400"> (you)</span>}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {!m.claimed && (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-700">
                            Invited
                          </span>
                        )}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${
                            m.role === 'client'
                              ? 'bg-violet-50 text-violet-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {roleChip(m.role)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-amber-700">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost" disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || members === null}
            className="btn-primary disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save sharing'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
