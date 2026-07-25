import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchOrg,
  renameOrg,
  addMember,
  removeMember,
  setMemberRole,
  setSeats,
  openBillingPortal,
  type OrgView,
} from '../../../lib/orgClient';
import { useDialog } from '../Dialog';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
  trialing: { label: 'Trial', cls: 'bg-emerald-50 text-emerald-700' },
  past_due: { label: 'Past due', cls: 'bg-amber-50 text-amber-700' },
  canceled: { label: 'Canceled', cls: 'bg-red-50 text-red-700' },
  paused: { label: 'Paused', cls: 'bg-slate-100 text-slate-600' },
};

/**
 * Manager-only: run the organization from the dashboard. Rename it, add and
 * remove members, promote managers, change the seat count (Stripe-billed orgs
 * only), and open the organization's billing portal.
 */
export default function OrgPanel({
  open,
  onClose,
  orgId,
  onOrgRenamed,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string | null;
  /** Lets the dashboard refresh the workspace switcher after a rename. */
  onOrgRenamed?: () => void;
}) {
  const [view, setView] = useState<OrgView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [seatDraft, setSeatDraft] = useState<number | null>(null);
  const { confirm, dialog } = useDialog();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const reload = () => {
    if (!orgId) return;
    fetchOrg(orgId)
      .then((d) => {
        setView(d);
        setName(d.org.name);
        setSeatDraft(null);
      })
      .catch((e) => setError((e as Error).message));
  };

  useEffect(() => {
    if (open) {
      setError(null);
      setNotice(null);
      setView(null);
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId]);

  if (!open || typeof document === 'undefined' || !orgId) return null;

  const run = async (fn: () => Promise<void>, successNotice?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successNotice) setNotice(successNotice);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const org = view?.org;
  const members = view?.members ?? [];
  const managerCount = view?.manager_count ?? 0;
  const memberCount = view?.member_count ?? 0;
  const minSeats = Math.max(view?.min_seats ?? 1, memberCount);
  const seats = seatDraft ?? org?.seats ?? 0;
  const status = org ? (STATUS_LABEL[org.status] ?? { label: org.status, cls: 'bg-slate-100 text-slate-600' }) : null;

  const doRemove = async (memberId: string, email: string) => {
    const ok = await confirm({
      title: 'Remove this member?',
      message: `${email} loses access immediately. Their seat frees up for someone else.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    await run(() => removeMember(orgId, memberId));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink-800/50 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Organization settings"
        className="my-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-card-hover"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-ink-800">
            Organization settings{org ? ` · ${org.name}` : ''}
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Close">
            ✕
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{error}</p>
        )}
        {notice && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            {notice}
          </p>
        )}

        {!view && !error && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

        {org && (
          <div className="mt-5 space-y-6">
            {/* Name */}
            <section>
              <h3 className="text-sm font-semibold text-ink-800">Name</h3>
              <div className="mt-2 flex gap-2">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  aria-label="Organization name"
                />
                <button
                  type="button"
                  className="btn-secondary whitespace-nowrap text-sm"
                  disabled={busy || name.trim().length < 2 || name.trim() === org.name}
                  onClick={() =>
                    run(async () => {
                      await renameOrg(orgId, name.trim());
                      onOrgRenamed?.();
                    }, 'Name saved.')
                  }
                >
                  Save
                </button>
              </div>
            </section>

            {/* Members */}
            <section>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-ink-800">Members</h3>
                <span className="text-xs text-slate-500">
                  {memberCount} of {org.seats} seats used
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {members.map((m) => {
                  const lastManager = m.role === 'manager' && managerCount <= 1;
                  return (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        {m.email}
                        {m.is_self && <span className="text-slate-400"> (you)</span>}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          m.claimed
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {m.claimed ? 'Claimed' : 'Invited'}
                      </span>
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 disabled:opacity-50"
                        value={m.role}
                        disabled={busy || lastManager}
                        title={lastManager ? 'An organization needs at least one manager.' : undefined}
                        onChange={(e) =>
                          run(() => setMemberRole(orgId, m.id, e.target.value as 'member' | 'manager'))
                        }
                        aria-label={`Role for ${m.email}`}
                      >
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                      </select>
                      <button
                        type="button"
                        className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
                        disabled={busy || lastManager}
                        title={lastManager ? 'An organization needs at least one manager.' : `Remove ${m.email}`}
                        onClick={() => doRemove(m.id, m.email)}
                        aria-label={`Remove ${m.email}`}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const email = newEmail.trim();
                  if (!email) return;
                  run(async () => {
                    await addMember(orgId, email);
                    setNewEmail('');
                  }, 'Member added. They get access by signing in with that email.');
                }}
              >
                <input
                  className={inputClass}
                  type="email"
                  placeholder="teammate@company.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  aria-label="New member email"
                />
                <button
                  type="submit"
                  className="btn-secondary whitespace-nowrap text-sm"
                  disabled={busy || newEmail.trim() === ''}
                >
                  Add member
                </button>
              </form>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                No invite email is sent: the address is the credential. Tell them to sign in at
                solutionseeking.com with that email and their seat activates automatically.
              </p>
            </section>

            {/* Seats */}
            <section>
              <h3 className="text-sm font-semibold text-ink-800">Seats</h3>
              {org.billing === 'stripe' ? (
                <>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost px-3 text-lg"
                      disabled={busy || seats <= minSeats}
                      onClick={() => setSeatDraft(Math.max(seats - 1, minSeats))}
                      aria-label="Fewer seats"
                    >
                      −
                    </button>
                    <span className="w-12 text-center text-sm font-semibold text-ink-800">
                      {seats}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost px-3 text-lg"
                      disabled={busy}
                      onClick={() => setSeatDraft(seats + 1)}
                      aria-label="More seats"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn-secondary ml-2 whitespace-nowrap text-sm"
                      disabled={busy || seatDraft === null || seatDraft === org.seats}
                      onClick={() => run(() => setSeats(orgId, seats), 'Seat count updated.')}
                    >
                      Save seats
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    Changes take effect right away. Your next invoice is adjusted for the
                    difference.
                  </p>
                </>
              ) : (
                <p className="mt-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                  Your organization is billed by invoice. Contact us to change seats.
                </p>
              )}
            </section>

            {/* Billing */}
            {org.has_billing && (
              <section>
                <h3 className="text-sm font-semibold text-ink-800">Billing</h3>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {status && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.cls}`}>
                      {status.label}
                    </span>
                  )}
                  {org.current_period_end && (
                    <span className="text-xs text-slate-500">
                      Renews {new Date(org.current_period_end).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const url = await openBillingPortal(orgId);
                        if (url) window.location.href = url;
                      })
                    }
                  >
                    Manage billing
                  </button>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Invoices, payment method, and cancellation live in the billing portal.
                </p>
              </section>
            )}
          </div>
        )}
      </div>
      {dialog}
    </div>,
    document.body
  );
}
