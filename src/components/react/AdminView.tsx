import { useEffect, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { useDialog } from './Dialog';

/**
 * The operator's console.
 *
 * This page's HTML is public and contains no data. Every byte shown here arrives
 * from an /api/admin/* route that checks requireAdmin() first, so a curious
 * visitor who finds /admin sees an empty shell and a 403. Do not be tempted to
 * "protect" the page itself: auth is a Bearer token in localStorage, so there is
 * no way to gate a page before it renders, and pretending otherwise would give a
 * false sense of where the boundary is. The boundary is the API.
 */

type Tab = 'feedback' | 'orgs' | 'subscribers' | 'enquiries';

interface FeedbackRow {
  id: string;
  helpful: boolean;
  agent: string;
  context: string | null;
  message_count: number | null;
  display_name: string | null;
  role_title: string | null;
  quote: string | null;
  note: string | null;
  consent_publish: boolean;
  status: 'new' | 'approved' | 'rejected';
  is_anonymous: boolean;
  created_at: string;
}

interface OrgMember {
  id: string;
  email: string;
  claimed: boolean;
  joined_at: string | null;
}

interface OrgRow {
  id: string;
  name: string;
  seats: number;
  status: string;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  note: string | null;
  members: OrgMember[];
}

interface SubscriberRow {
  id: string;
  email: string;
  source: string;
  status: string;
  confirmed_at: string | null;
  created_at: string;
}

interface EnquiryRow {
  id: string;
  name: string;
  email: string;
  team_size: string | null;
  note: string | null;
  handled: boolean;
  created_at: string;
}

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

export default function AdminView() {
  const { session, user, loading } = useSession();
  const [tab, setTab] = useState<Tab>('feedback');
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [subscribers, setSubscribers] = useState<SubscriberRow[] | null>(null);
  const [bySource, setBySource] = useState<Record<string, { total: number; confirmed: number }>>({});
  const [enquiries, setEnquiries] = useState<EnquiryRow[] | null>(null);
  const { confirm, dialog } = useDialog();

  const call = async (path: string, body?: unknown) => {
    if (!session) return null;
    const res = await fetch(`/api/admin/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 403) {
      setForbidden(true);
      return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.message ?? 'Something went wrong.');
      return null;
    }
    setError(null);
    return data;
  };

  const loadTab = async (which: Tab) => {
    if (which === 'feedback') {
      const d = await call('feedback');
      if (d) setFeedback(d.rows);
    } else if (which === 'orgs') {
      const d = await call('orgs');
      if (d) setOrgs(d.rows);
    } else if (which === 'subscribers') {
      const d = await call('subscribers');
      if (d) {
        setSubscribers(d.rows);
        setBySource(d.bySource ?? {});
      }
    } else {
      const d = await call('enquiries');
      if (d) setEnquiries(d.rows);
    }
  };

  useEffect(() => {
    if (loading || !session) return;
    void loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session?.access_token, tab]);

  const publish = async () => {
    const ok = await confirm({
      title: 'Rebuild the site?',
      message:
        'Approved testimonials are read when the site builds, so this is what actually puts them in front of visitors (and what removes anything you have rejected). It takes about two minutes.',
      confirmLabel: 'Publish',
    });
    if (!ok) return;
    setPublishing(true);
    const d = await call('publish', {});
    setPublishing(false);
    if (d?.ok) setNotice(d.message ?? 'Build started.');
  };

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;

  if (!session || !user || user.is_anonymous) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-card">
        <p className="text-sm text-slate-600">You need to be signed in as an administrator.</p>
        <a href="/account?next=/admin" className="btn-primary mt-4 inline-block">
          Sign in
        </a>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-card">
        <p className="text-sm text-slate-600">
          This account is not an administrator.
        </p>
        <p className="mt-1 text-xs text-slate-400">Signed in as {user.email}</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'feedback', label: 'Feedback', count: feedback?.filter((f) => f.status === 'new').length },
    { id: 'orgs', label: 'Organizations', count: orgs?.length },
    { id: 'subscribers', label: 'Email list', count: subscribers?.length },
    { id: 'enquiries', label: 'Enquiries', count: enquiries?.filter((e) => !e.handled).length },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
              {t.count ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={publish}
          disabled={publishing}
          className="btn-secondary text-sm disabled:opacity-60"
        >
          {publishing ? 'Starting…' : 'Publish to site'}
        </button>
      </div>

      {notice && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{notice}</p>
      )}
      {error && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{error}</p>
      )}

      {tab === 'feedback' && (
        <FeedbackTab
          rows={feedback}
          onSet={async (id, status) => {
            const d = await call('feedback', { id, status });
            if (d?.ok) void loadTab('feedback');
          }}
        />
      )}
      {tab === 'orgs' && <OrgsTab rows={orgs} call={call} reload={() => loadTab('orgs')} />}
      {tab === 'subscribers' && <SubscribersTab rows={subscribers} bySource={bySource} />}
      {tab === 'enquiries' && (
        <EnquiriesTab
          rows={enquiries}
          onHandled={async (id, handled) => {
            const d = await call('enquiries', { id, handled });
            if (d?.ok) void loadTab('enquiries');
          }}
        />
      )}
      {dialog}
    </div>
  );
}

/* ---------------------------------------------------------------- Feedback */

function FeedbackTab({
  rows,
  onSet,
}: {
  rows: FeedbackRow[] | null;
  onSet: (id: string, status: 'approved' | 'rejected' | 'new') => void;
}) {
  if (!rows) return <p className="text-sm text-slate-400">Loading…</p>;
  if (rows.length === 0) {
    return (
      <Empty>
        Nobody has answered "Did this help?" yet. It appears once a conversation reaches a prep
        summary, so it only shows up when the assistant has actually finished the protocol.
      </Empty>
    );
  }

  const rate = rows.filter((r) => r.helpful).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {rate} of {rows.length} said it helped. The ones who said "not yet" are the useful ones.
      </p>
      {rows.map((r) => {
        // The database refuses to approve a row without consent AND a quote, so
        // do not offer a button that can only fail.
        const publishable = r.consent_publish && Boolean(r.quote?.trim());
        return (
          <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2.5 py-0.5 font-semibold ${
                  r.helpful ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {r.helpful ? 'Helped' : 'Not yet'}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600">
                {r.agent}
              </span>
              {r.status !== 'new' && (
                <span
                  className={`rounded-full px-2.5 py-0.5 font-semibold ${
                    r.status === 'approved'
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {r.status}
                </span>
              )}
              <span className="text-slate-400">{date(r.created_at)}</span>
              {r.message_count != null && (
                <span className="text-slate-400">{r.message_count} messages</span>
              )}
            </div>

            {r.quote && (
              <blockquote className="mt-3 border-l-2 border-brand-200 pl-3 text-sm leading-relaxed text-slate-700">
                "{r.quote}"
              </blockquote>
            )}
            {r.note && (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
                {r.note}
              </p>
            )}
            {!r.quote && !r.note && (
              <p className="mt-3 text-sm text-slate-400">They rated it but wrote nothing.</p>
            )}

            {(r.display_name || r.role_title) && (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {[r.display_name, r.role_title].filter(Boolean).join(', ')}
              </p>
            )}

            {r.quote && (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                {publishable ? (
                  <>
                    {r.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => onSet(r.id, 'approved')}
                        className="rounded-full bg-brand-500 px-3.5 py-1 text-xs font-semibold text-white hover:bg-brand-600"
                      >
                        Approve for the site
                      </button>
                    )}
                    {r.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => onSet(r.id, 'rejected')}
                        className="rounded-full border border-slate-200 px-3.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                      >
                        Take it down
                      </button>
                    )}
                    {r.status === 'new' && (
                      <button
                        type="button"
                        onClick={() => onSet(r.id, 'rejected')}
                        className="text-xs font-medium text-slate-400 hover:text-slate-600"
                      >
                        Reject
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400">
                    Cannot be published: they did not consent.
                  </p>
                )}
                {r.status === 'approved' && (
                  <span className="text-xs text-slate-400">
                    Press "Publish to site" to make this live.
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- Orgs */

function OrgsTab({
  rows,
  call,
  reload,
}: {
  rows: OrgRow[] | null;
  call: (path: string, body?: unknown) => Promise<any>;
  reload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('5');
  const [memberEmail, setMemberEmail] = useState<Record<string, string>>({});

  if (!rows) return <p className="text-sm text-slate-400">Loading…</p>;

  const create = async () => {
    if (!name.trim()) return;
    const d = await call('orgs', { action: 'create', name, seats: Number(seats) });
    if (d?.ok) {
      setName('');
      setSeats('5');
      setCreating(false);
      reload();
    }
  };

  const addMember = async (orgId: string) => {
    const email = (memberEmail[orgId] ?? '').trim();
    if (!email) return;
    const d = await call('orgs', { action: 'add_member', org_id: orgId, email });
    if (d?.ok) {
      setMemberEmail((m) => ({ ...m, [orgId]: '' }));
      reload();
    }
  };

  const renewalSoon = (iso: string | null) =>
    iso ? new Date(iso).getTime() - Date.now() < 14 * 24 * 60 * 60 * 1000 : false;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
        {creating ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Organization
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ridgeview Co-op"
                className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Seats
              <input
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                type="number"
                min="1"
                className="mt-1 block w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button type="button" onClick={create} className="btn-primary py-2 text-xs">
              Create
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-xs font-medium text-slate-500"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              An organization pays once, and everyone you list here gets unlimited access.
            </p>
            <button type="button" onClick={() => setCreating(true)} className="btn-primary py-2 text-xs">
              New organization
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 && (
        <Empty>
          No organizations yet. When a team enquiry comes in, create one here, add their emails, and
          bill them in Stripe by hand.
        </Empty>
      )}

      {rows.map((o) => (
        <div key={o.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-bold text-ink-800">{o.name}</h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                ['active', 'trialing', 'past_due'].includes(o.status)
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {o.status}
            </span>
            <span className="text-xs text-slate-500">
              {o.members.length} of {o.seats} seats
            </span>
            {o.current_period_end && (
              <span
                className={`text-xs ${renewalSoon(o.current_period_end) ? 'font-semibold text-amber-700' : 'text-slate-400'}`}
              >
                Renews {date(o.current_period_end)}
              </span>
            )}
          </div>

          <ul className="mt-3 space-y-1">
            {o.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <span className="text-slate-700">{m.email}</span>
                <span className="flex items-center gap-3">
                  <span className={`text-xs ${m.claimed ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {m.claimed ? 'signed in' : 'has not signed in yet'}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const d = await call('orgs', { action: 'remove_member', id: m.id });
                      if (d?.ok) reload();
                    }}
                    className="text-xs font-medium text-slate-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <input
              value={memberEmail[o.id] ?? ''}
              onChange={(e) => setMemberEmail((m) => ({ ...m, [o.id]: e.target.value }))}
              placeholder="member@example.com"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => addMember(o.id)} className="btn-secondary py-2 text-xs">
              Add member
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            They get access by signing in with exactly this address, so tell them which one to use.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {['active', 'past_due', 'canceled'].map((s) => (
              <button
                key={s}
                type="button"
                disabled={o.status === s}
                onClick={async () => {
                  const d = await call('orgs', { action: 'update', id: o.id, status: s });
                  if (d?.ok) reload();
                }}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-40"
              >
                Set {s}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Subscribers */

function SubscribersTab({
  rows,
  bySource,
}: {
  rows: SubscriberRow[] | null;
  bySource: Record<string, { total: number; confirmed: number }>;
}) {
  if (!rows) return <p className="text-sm text-slate-400">Loading…</p>;
  if (rows.length === 0) {
    return <Empty>Nobody has joined the list yet. The guide download at /guide is the front door.</Empty>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {Object.entries(bySource).map(([source, c]) => (
          <div key={source} className="rounded-2xl border border-slate-100 bg-white px-5 py-3 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{source}</p>
            <p className="mt-1 text-sm text-ink-800">
              <strong>{c.confirmed}</strong> confirmed of {c.total}
            </p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Source</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-2.5 text-slate-700">{r.email}</td>
                <td className="px-5 py-2.5 text-slate-500">{r.source}</td>
                <td className="px-5 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-slate-400">{date(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Enquiries */

function EnquiriesTab({
  rows,
  onHandled,
}: {
  rows: EnquiryRow[] | null;
  onHandled: (id: string, handled: boolean) => void;
}) {
  if (!rows) return <p className="text-sm text-slate-400">Loading…</p>;
  if (rows.length === 0) {
    return <Empty>No team enquiries yet. The form is on /pricing.</Empty>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink-800">{r.name}</p>
              <p className="text-sm text-slate-500">
                <a href={`mailto:${r.email}`} className="text-brand-600 hover:text-brand-700">
                  {r.email}
                </a>
                {r.team_size ? ` · ${r.team_size}` : ''} · {date(r.created_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onHandled(r.id, !r.handled)}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold ${
                r.handled
                  ? 'bg-slate-100 text-slate-500'
                  : 'bg-brand-500 text-white hover:bg-brand-600'
              }`}
            >
              {r.handled ? 'Handled' : 'Mark handled'}
            </button>
          </div>
          {r.note && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
              {r.note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
      <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-500">{children}</p>
    </div>
  );
}
