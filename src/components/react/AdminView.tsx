import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { useDialog, type PromptOptions } from './Dialog';
import { DISPLAY_NAME_MAX } from '../../lib/course/certificateRules';

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

type Tab = 'feedback' | 'orgs' | 'subscribers' | 'enquiries' | 'grading' | 'reviews' | 'enrollments' | 'certificates' | 'content';

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
  role: 'member' | 'manager' | 'client';
  joined_at: string | null;
}

interface OrgRow {
  id: string;
  name: string;
  seats: number;
  status: string;
  billing: 'manual' | 'stripe';
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

interface GradingRow {
  id: string;
  attempt_id: string;
  generation: number;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  reason: 'submission' | 'retry' | 'regrade';
  attempts: number;
  max_attempts: number;
  error_category: string | null;
  last_error: string | null;
  model: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  attempt_state: string | null;
  user_id: string | null;
  form_id: string | null;
  submitted_at: string | null;
}

interface EnrollmentRow {
  id: string;
  user_id: string;
  email: string | null;
  status: 'enrolled' | 'revoked' | 'refunded';
  source: 'stripe' | 'admin';
  purchased_at: string | null;
  access_starts_at: string;
  access_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LadderRow {
  id: string;
  seq: number;
  module: string;
  title: string;
  status: string;
  next: string | null;
  missing: string[];
  videoPlaceholder: boolean;
}

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

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
  const [grading, setGrading] = useState<GradingRow[] | null>(null);
  const [reviews, setReviews] = useState<AdminReviewRow[] | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[] | null>(null);
  const [certificates, setCertificates] = useState<{ rows: AdminCertificateRow[]; pending: PendingPassRow[] } | null>(null);
  const certificateQuery = useRef('');
  const [content, setContent] = useState<{ rows: LadderRow[]; summary: string } | null>(null);
  const { confirm, prompt, dialog } = useDialog();

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
    } else if (which === 'grading') {
      const d = await call('course?view=grading');
      if (d) setGrading(d.rows);
    } else if (which === 'reviews') {
      const d = await call('course?view=reviews');
      if (d) setReviews(d.rows);
    } else if (which === 'enrollments') {
      const d = await call('course?view=enrollments');
      if (d) setEnrollments(d.rows);
    } else if (which === 'content') {
      const d = await call('course?view=content');
      if (d) setContent({ rows: d.rows, summary: d.summary });
    } else if (which === 'certificates') {
      const d = await call(`course?view=certificates&q=${encodeURIComponent(certificateQuery.current)}`);
      if (d) setCertificates({ rows: d.rows, pending: d.pending });
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
    { id: 'grading', label: 'Grading' },
    { id: 'reviews', label: 'Reviews', count: reviews?.filter((r) => r.state === 'open').length },
    { id: 'enrollments', label: 'Enrollments', count: enrollments?.filter((e) => e.status === 'enrolled').length },
    { id: 'certificates', label: 'Certificates' },
    { id: 'content', label: 'Content' },
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
      {tab === 'grading' && (
        <GradingTab
          rows={grading}
          onAction={async (action, jobId) => {
            const d = await call('course', { action, job_id: jobId });
            if (d) {
              setNotice(action === 'retry_job' ? 'Job queued for another try.' : 'Worker triggered.');
              await loadTab('grading');
            }
          }}
        />
      )}
      {tab === 'reviews' && (
        <ReviewsTab
          rows={reviews}
          act={(body) => call('course', body)}
          reload={() => loadTab('reviews')}
          notify={setNotice}
          warn={setError}
        />
      )}
      {tab === 'enrollments' && (
        <EnrollmentsTab
          rows={enrollments}
          call={call}
          reload={() => loadTab('enrollments')}
          setNotice={setNotice}
          prompt={prompt}
        />
      )}
      {tab === 'certificates' && (
        <CertificatesTab
          data={certificates}
          onSearch={(q) => {
            certificateQuery.current = q;
            void loadTab('certificates');
          }}
          act={(body) => call('course', body)}
          reload={() => loadTab('certificates')}
          notify={setNotice}
          warn={setError}
        />
      )}
      {tab === 'content' && <ContentTab data={content} />}
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
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                o.billing === 'stripe'
                  ? 'bg-brand-50 text-brand-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
              title={
                o.billing === 'stripe'
                  ? 'Self-serve per-seat subscription; seats follow the Stripe quantity.'
                  : 'Billed by hand (invoice or a hand-run Stripe subscription).'
              }
            >
              {o.billing === 'stripe' ? 'self-serve' : 'manual billing'}
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
            {o.stripe_customer_id && (
              <a
                href={`https://dashboard.stripe.com/customers/${o.stripe_customer_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Stripe ↗
              </a>
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
                  {/* Managers run the org; members author; clients only use what is shared with them. */}
                  <select
                    value={m.role}
                    onChange={async (e) => {
                      const d = await call('orgs', { action: 'set_role', id: m.id, role: e.target.value });
                      if (d?.ok) reload();
                    }}
                    aria-label={`Role for ${m.email}`}
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="client">Client</option>
                  </select>
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
            <button
              type="button"
              title="Flip only when the org really runs on the per-seat team subscription: 'self-serve' lets its managers change seats, and the webhook drives the seat count from the Stripe quantity."
              onClick={async () => {
                const d = await call('orgs', {
                  action: 'update',
                  id: o.id,
                  billing: o.billing === 'stripe' ? 'manual' : 'stripe',
                });
                if (d?.ok) reload();
              }}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
            >
              Make {o.billing === 'stripe' ? 'manual billing' : 'self-serve'}
            </button>
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
              <th className="whitespace-nowrap px-5 py-3">Status</th>
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
    return <Empty>No team enquiries yet. The form is on /for-business.</Empty>;
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

/* ---------------------------------------------------------------- Grading */

function GradingTab({
  rows,
  onAction,
}: {
  rows: GradingRow[] | null;
  onAction: (action: 'retry_job' | 'kick_job', jobId: string) => void;
}) {
  if (!rows) return <p className="text-sm text-slate-400">Loading…</p>;
  if (rows.length === 0) {
    return <Empty>No grading jobs yet.</Empty>;
  }

  const stateBadge: Record<GradingRow['state'], string> = {
    queued: 'bg-slate-100 text-slate-600',
    running: 'bg-amber-100 text-amber-800',
    succeeded: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-5 py-3">Job</th>
            <th className="px-5 py-3">Attempt state</th>
            <th className="whitespace-nowrap px-5 py-3">Learner</th>
            <th className="px-5 py-3">Form</th>
            <th className="px-5 py-3">Job state</th>
            <th className="px-5 py-3">Attempts</th>
            <th className="px-5 py-3">Error</th>
            <th className="px-5 py-3">Updated</th>
            <th className="whitespace-nowrap px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-50 last:border-0">
              <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{r.id.slice(0, 8)}</td>
              <td className="px-5 py-2.5 text-slate-500">{r.attempt_state ?? ''}</td>
              <td className="px-5 py-2.5 font-mono text-xs text-slate-500">
                {r.user_id ? r.user_id.slice(0, 8) : ''}
              </td>
              <td className="px-5 py-2.5 text-slate-500">{r.form_id ?? ''}</td>
              <td className="px-5 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateBadge[r.state]}`}>
                  {r.state}
                </span>
              </td>
              <td className="px-5 py-2.5 text-slate-500">
                {r.attempts}/{r.max_attempts}
              </td>
              <td className="max-w-xs px-5 py-2.5 align-top text-slate-500">
                {r.error_category && (
                  <p className="text-xs font-semibold text-red-700">{r.error_category}</p>
                )}
                {r.last_error && (
                  <p className="mt-0.5 break-words text-xs text-slate-400">{r.last_error}</p>
                )}
              </td>
              <td className="px-5 py-2.5 text-slate-400">
                {date(r.updated_at)} {time(r.updated_at)}
              </td>
              <td className="px-5 py-2.5">
                {r.state === 'failed' && (
                  <button
                    type="button"
                    onClick={() => onAction('retry_job', r.id)}
                    className="rounded-full bg-brand-500 px-3.5 py-1 text-xs font-semibold text-white hover:bg-brand-600"
                  >
                    Retry
                  </button>
                )}
                {(r.state === 'queued' || r.state === 'running') && (
                  <button
                    type="button"
                    onClick={() => onAction('kick_job', r.id)}
                    className="rounded-full border border-slate-200 px-3.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                  >
                    Kick
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ Certificates */

interface AdminCertificateRow {
  id: string;
  serial: string;
  user_id: string;
  email: string | null;
  certification_version: string;
  attempt_id: string | null;
  display_name: string | null;
  name_confirmed_at: string | null;
  issued_at: string;
  status: 'active' | 'revoked';
  revoked_at: string | null;
  revoke_reason: string | null;
  share_active: boolean;
  email_sent_at: string | null;
}

interface PendingPassRow {
  attempt_id: string;
  user_id: string;
  email: string | null;
  certification_version: string;
  finalized_at: string | null;
}

/** The learner's address where the account has one, and the short id otherwise. */
function Learner({ email, userId }: { email: string | null; userId: string }) {
  if (email) return <span className="whitespace-nowrap">{email}</span>;
  return <span className="whitespace-nowrap font-mono text-xs text-slate-500">{userId.slice(0, 8)}</span>;
}

/**
 * Certificates: a search box (serial, email or version), the passes still
 * waiting for a certificate, and the list. Every row names the learner by
 * the address they sign in with, because an operator here is looking for a
 * person. Every action reloads the list either way, since a refusal
 * usually means the list was behind the database.
 */
function CertificatesTab({
  data,
  onSearch,
  act,
  reload,
  notify,
  warn,
}: {
  data: { rows: AdminCertificateRow[]; pending: PendingPassRow[] } | null;
  onSearch: (q: string) => void;
  act: (body: Record<string, unknown>) => Promise<{ ok?: boolean; issued?: boolean; serial?: string; sent?: boolean } | null>;
  reload: () => Promise<void>;
  notify: (text: string) => void;
  warn: (text: string) => void;
}) {
  const { prompt, dialog } = useDialog();
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const issue = async (attemptId: string) => {
    setBusyId(attemptId);
    const d = await act({ action: 'issue_pending', attempt_id: attemptId });
    if (d) notify(d.issued ? `Issued ${d.serial}.` : `Already issued as ${d.serial}.`);
    await reload();
    setBusyId(null);
  };
  const revoke = async (row: AdminCertificateRow) => {
    const reason = await prompt({
      title: `Revoke ${row.serial}?`,
      message: 'The learner sees the revoked state and the verification link stops resolving. There is no undo here.',
      label: 'Reason',
      maxLength: 500,
      confirmLabel: 'Revoke',
    });
    // Cancelling is a decision and says nothing. Confirming with the box empty
    // is not, and silently doing nothing there reads as a broken button.
    if (reason === null) return;
    if (!reason.trim()) {
      warn('Revoking needs a reason. It is the only record of why, because nothing brings a certificate back.');
      return;
    }
    setBusyId(row.id);
    const d = await act({ action: 'revoke_certificate', certificate_id: row.id, reason: reason.trim() });
    if (d) notify(`Revoked ${row.serial}.`);
    await reload();
    setBusyId(null);
  };
  const rename = async (row: AdminCertificateRow) => {
    const name = await prompt({
      title: `Rename ${row.serial}`,
      message: 'For a typo the learner reports. The confirmation stands; only the printed name changes.',
      label: 'Name',
      defaultValue: row.display_name ?? '',
      maxLength: DISPLAY_NAME_MAX,
      confirmLabel: 'Rename',
    });
    if (name === null) return;
    if (!name.trim()) {
      warn('Renaming needs a name. Cancel instead to leave the certificate as it is.');
      return;
    }
    setBusyId(row.id);
    const d = await act({ action: 'rename_certificate', certificate_id: row.id, name: name.trim() });
    if (d) notify('Name updated.');
    await reload();
    setBusyId(null);
  };
  const resend = async (row: AdminCertificateRow) => {
    setBusyId(row.id);
    const d = await act({ action: 'resend_certificate_email', certificate_id: row.id });
    if (d) notify(d.sent ? `Emailed ${row.serial}.` : 'Not sent: no address on file, or the mail service is not configured.');
    await reload();
    setBusyId(null);
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(q);
        }}
        className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Serial, email or version
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SSS-2026-00001" className="mt-1 block w-72 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="btn-primary py-2 text-xs">
            Search
          </button>
        </div>
      </form>

      {data && data.pending.length > 0 && (
        <section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
          <h2 className="px-5 pt-4 font-heading text-base font-bold text-ink-800">Passes without a certificate</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="whitespace-nowrap px-3 py-3">Attempt</th>
                <th className="whitespace-nowrap px-3 py-3">Learner</th>
                <th className="whitespace-nowrap px-3 py-3">Version</th>
                <th className="whitespace-nowrap px-3 py-3">Passed</th>
                <th className="whitespace-nowrap px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.pending.map((p) => (
                <tr key={p.attempt_id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500">{p.attempt_id.slice(0, 8)}</td>
                  <td className="px-3 py-2.5">
                    <Learner email={p.email} userId={p.user_id} />
                  </td>
                  <td className="px-3 py-2.5">{p.certification_version}</td>
                  <td className="px-3 py-2.5 text-slate-400">{p.finalized_at ? `${date(p.finalized_at)} ${time(p.finalized_at)}` : ''}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={busyId === p.attempt_id}
                      onClick={() => issue(p.attempt_id)}
                      className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                    >
                      Issue
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="whitespace-nowrap px-3 py-3">Serial</th>
              <th className="whitespace-nowrap px-3 py-3">Learner</th>
              <th className="whitespace-nowrap px-3 py-3">Name</th>
              <th className="whitespace-nowrap px-3 py-3">Issued</th>
              <th className="whitespace-nowrap px-3 py-3">Status</th>
              <th className="whitespace-nowrap px-3 py-3">Link</th>
              <th className="whitespace-nowrap px-3 py-3">Emailed</th>
              <th className="whitespace-nowrap px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data && data.rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-slate-400" colSpan={8}>
                  No certificates match.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{r.serial}</td>
                <td className="px-3 py-2.5">
                  <Learner email={r.email} userId={r.user_id} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {r.name_confirmed_at ? (
                    r.display_name
                  ) : r.display_name ? (
                    <>
                      {r.display_name} <span className="text-slate-400">not confirmed</span>
                    </>
                  ) : (
                    <span className="text-slate-400">not confirmed</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{date(r.issued_at)}</td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{r.status}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-500">{r.status === 'active' && r.share_active ? 'on' : 'off'}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{r.email_sent_at ? date(r.email_sent_at) : 'no'}</td>
                <td className="space-x-2 whitespace-nowrap px-3 py-2.5">
                  {r.status === 'active' && (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => rename(r)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-60"
                    >
                      Rename
                    </button>
                  )}
                  {r.status === 'active' && r.email_sent_at === null && (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => resend(r)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-60"
                    >
                      Resend
                    </button>
                  )}
                  {r.status === 'active' && (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => revoke(r)}
                      className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  )}
                  {r.status === 'revoked' && r.revoke_reason && (
                    // A reason can run to five hundred characters, so it is clipped
                    // here and given in full on hover rather than stretching the row.
                    <span className="inline-block max-w-[15rem] truncate align-middle text-xs text-slate-400" title={r.revoke_reason}>
                      {r.revoke_reason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-400">
        A date in Emailed means a send was attempted, so Resend is not offered for that row. If a
        learner says the certificate email never arrived, the Resend log and the address on their
        account are the next places to look.
      </p>
      {dialog}
    </div>
  );
}

interface AdminReviewRow {
  id: string;
  attempt_id: string;
  user_id: string;
  email: string | null;
  state: 'open' | 'resolved';
  criterion_id: string;
  criterion_name: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  owner: string | null;
  resolution: string | null;
  certificate_action: 'none' | 'issue' | 'revoke';
  grade: {
    id: string;
    total: number;
    passed: boolean;
    rubric_version: string;
    criteria: { criterion_id: string; score: number; reason: string; evidence: { prompt_id: string; exact_quote: string }[] }[];
    principles: { id: string; coverage: string }[];
    tools: { id: string; coverage: string }[];
    misconceptions: { criterion_id: string; description: string }[];
    caps_applied: { criterion_id: string; cause: string; detail: string; from: number; to: number }[];
  } | null;
  responses: { prompt_id: string; prompt_label: string; text: string }[];
  certificate: { id: string; serial: string; status: 'active' | 'revoked' } | null;
}

/**
 * The review queue. Open requests first. Each one opens into what judging it
 * needs: the learner's words, the grader's score and quotes for the criterion
 * they named, the findings that capped it, and their whole response. Resolving
 * corrects scores, withdraws findings the grader got wrong, and says what
 * should happen to a certificate.
 */
function ReviewsTab({
  rows,
  act,
  reload,
  notify,
  warn,
}: {
  rows: AdminReviewRow[] | null;
  act: (body: Record<string, unknown>) => Promise<{ ok?: boolean; passed?: boolean; certificate?: string } | null>;
  reload: () => Promise<void>;
  notify: (text: string) => void;
  warn: (text: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [withdrawn, setWithdrawn] = useState<{ principles: string[]; tools: string[]; misconceptions: number[] }>({ principles: [], tools: [], misconceptions: [] });
  const [certificateAction, setCertificateAction] = useState<'none' | 'issue' | 'revoke'>('none');
  const [busy, setBusy] = useState(false);

  const openRow = (row: AdminReviewRow) => {
    setOpenId(row.id === openId ? null : row.id);
    setResolution('');
    setScores({});
    setWithdrawn({ principles: [], tools: [], misconceptions: [] });
    setCertificateAction('none');
  };

  const toggle = (kind: 'principles' | 'tools', id: string) =>
    setWithdrawn((w) => ({ ...w, [kind]: w[kind].includes(id) ? w[kind].filter((x) => x !== id) : [...w[kind], id] }));
  const toggleMisconception = (index: number) =>
    setWithdrawn((w) => ({ ...w, misconceptions: w.misconceptions.includes(index) ? w.misconceptions.filter((x) => x !== index) : [...w.misconceptions, index] }));

  const resolve = async (row: AdminReviewRow) => {
    if (!resolution.trim()) {
      warn('Write the answer the learner will read. It is the whole of what they get back.');
      return;
    }
    setBusy(true);
    const d = await act({
      action: 'resolve_review',
      review_id: row.id,
      resolution: resolution.trim(),
      certificate_action: certificateAction,
      corrections: { scores, principles: withdrawn.principles, tools: withdrawn.tools, misconceptions: withdrawn.misconceptions },
    });
    if (d) notify(`Answered. The attempt now reads ${d.passed ? 'passed' : 'not yet'}${d.certificate && d.certificate !== 'none' ? `, certificate ${d.certificate}d` : ''}.`);
    await reload();
    setOpenId(null);
    setBusy(false);
  };

  if (!rows) return <p className="text-slate-500">Loading…</p>;
  if (!rows.length) return <p className="rounded-2xl border border-slate-100 bg-white p-6 text-slate-500 shadow-card">No review requests.</p>;

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <section key={r.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.state === 'open' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{r.state}</span>
            <span className="font-semibold text-ink-800">{r.criterion_name}</span>
            <Learner email={r.email} userId={r.user_id} />
            <span className="text-xs text-slate-400">
              {date(r.created_at)} {time(r.created_at)}
            </span>
            {r.grade && <span className="text-xs text-slate-400">scored {r.grade.total.toFixed(1)}, {r.grade.passed ? 'passed' : 'not yet'}</span>}
          </div>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{r.reason}</p>

          {r.state === 'resolved' && (
            <div className="mt-3 text-sm text-slate-600">
              <p className="whitespace-pre-wrap">{r.resolution}</p>
              <p className="mt-1 text-xs text-slate-400">
                Answered by {r.owner ?? 'an admin'} on {date(r.resolved_at)}
                {r.certificate_action !== 'none' ? `, certificate ${r.certificate_action}d` : ''}
              </p>
            </div>
          )}

          {r.state === 'open' && (
            <button type="button" className="btn-secondary mt-4 py-2 text-xs" onClick={() => openRow(r)}>
              {openId === r.id ? 'Close' : 'Read and answer'}
            </button>
          )}

          {openId === r.id && r.grade && (
            <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-ink-800">What the grader said</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  {r.grade.criteria.map((c) => (
                    <li key={c.criterion_id} className={c.criterion_id === r.criterion_id ? 'rounded-xl bg-amber-50 px-3 py-2' : ''}>
                      <span className="font-semibold text-ink-800">{c.criterion_id}</span> scored {c.score}. {c.reason}
                      {c.evidence.map((e, i) => (
                        <span key={i} className="mt-1 block text-xs italic text-slate-500">“{e.exact_quote}”</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-ink-800">Corrected scores</h3>
                <div className="mt-2 flex flex-wrap gap-3">
                  {r.grade.criteria.map((c) => (
                    <label key={c.criterion_id} className="text-xs text-slate-600">
                      {c.criterion_id}
                      <input
                        type="number"
                        min={0}
                        max={4}
                        defaultValue={c.score}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setScores((s) => (next === c.score ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== c.criterion_id)) : { ...s, [c.criterion_id]: next }));
                        }}
                        className="mt-1 block w-16 rounded-xl border border-slate-200 px-2 py-1"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {(r.grade.principles.some((p) => p.coverage === 'missing' || p.coverage === 'misapplied') ||
                r.grade.tools.some((t) => t.coverage === 'missing' || t.coverage === 'misapplied') ||
                r.grade.misconceptions.length > 0) && (
                <div>
                  <h3 className="text-sm font-semibold text-ink-800">Findings that capped a score</h3>
                  <p className="text-xs text-slate-500">Tick anything the grader got wrong. Withdrawing a finding lifts the cap it caused.</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {r.grade.principles
                      .filter((p) => p.coverage === 'missing' || p.coverage === 'misapplied')
                      .map((p) => (
                        <label key={p.id} className="flex items-center gap-2">
                          <input type="checkbox" checked={withdrawn.principles.includes(p.id)} onChange={() => toggle('principles', p.id)} />
                          {p.id}: {p.coverage}
                        </label>
                      ))}
                    {r.grade.tools
                      .filter((t) => t.coverage === 'missing' || t.coverage === 'misapplied')
                      .map((t) => (
                        <label key={t.id} className="flex items-center gap-2">
                          <input type="checkbox" checked={withdrawn.tools.includes(t.id)} onChange={() => toggle('tools', t.id)} />
                          {t.id}: {t.coverage}
                        </label>
                      ))}
                    {r.grade.misconceptions.map((m, i) => (
                      <label key={i} className="flex items-center gap-2">
                        <input type="checkbox" checked={withdrawn.misconceptions.includes(i)} onChange={() => toggleMisconception(i)} />
                        {m.criterion_id}: {m.description}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-sm font-semibold text-ink-800">The learner's whole response</summary>
                <div className="mt-2 space-y-3">
                  {r.responses.map((p) => (
                    <div key={p.prompt_id}>
                      <p className="text-xs font-semibold text-slate-500">{p.prompt_label}</p>
                      <p className="whitespace-pre-wrap text-sm text-slate-600">{p.text}</p>
                    </div>
                  ))}
                </div>
              </details>

              <div>
                <label className="block text-sm font-semibold text-ink-800">
                  Your answer, which the learner reads
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    maxLength={2000}
                    rows={4}
                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold text-slate-600">
                  Certificate
                  <select
                    value={certificateAction}
                    onChange={(e) => setCertificateAction(e.target.value as 'none' | 'issue' | 'revoke')}
                    className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
                  >
                    <option value="none">Leave it as it is</option>
                    <option value="issue">Issue one</option>
                    <option value="revoke">Revoke the one they hold</option>
                  </select>
                  {r.certificate && (
                    <span className="ml-2 text-slate-400">
                      They hold {r.certificate.serial}, {r.certificate.status}.
                    </span>
                  )}
                </label>
                <button type="button" className="btn-primary mt-4 py-2 text-xs" disabled={busy} onClick={() => resolve(r)}>
                  {busy ? 'Saving…' : 'Answer and record a new grade'}
                </button>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- Enrollments */

const NOTE_MAX = 500;

function EnrollmentsTab({
  rows,
  call,
  reload,
  setNotice,
  prompt,
}: {
  rows: EnrollmentRow[] | null;
  call: (path: string, body?: unknown) => Promise<any>;
  reload: () => void;
  setNotice: (notice: string | null) => void;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [granting, setGranting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setGranting(true);
    const d = await call('course', { action: 'grant', email: email.trim(), note: note.trim() || undefined });
    setGranting(false);
    if (d?.ok) {
      setEmail('');
      setNote('');
      setNotice('Access granted.');
    }
    // Reload either way. A refusal usually means this list is behind what the
    // database says, and the fix the operator needs is the current row.
    reload();
  };

  /**
   * Each access change asks for a note, which lands in the ledger beside the
   * admin's id. The note is optional; cancelling the dialog returns null and
   * nothing happens.
   */
  const act = async (
    action: 'revoke' | 'refund' | 'reinstate',
    row: EnrollmentRow,
    opts: PromptOptions,
    successNotice: string
  ) => {
    const note = await prompt({ label: 'Note for the ledger (optional)', maxLength: NOTE_MAX, ...opts });
    if (note === null) return;
    setBusyId(row.id);
    const d = await call('course', { action, user_id: row.user_id, note: note.trim() || undefined });
    setBusyId(null);
    if (d?.ok) setNotice(successNotice);
    reload();
  };

  const statusBadge: Record<EnrollmentRow['status'], string> = {
    enrolled: 'bg-emerald-100 text-emerald-700',
    revoked: 'bg-slate-100 text-slate-600',
    refunded: 'bg-amber-100 text-amber-800',
  };

  return (
    <div className="space-y-4">
      <form onSubmit={grant} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="learner@example.com"
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why, for the ledger (optional)"
              maxLength={NOTE_MAX}
              className="mt-1 block w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" disabled={granting} className="btn-primary py-2 text-xs disabled:opacity-60">
            {granting ? 'Granting…' : 'Grant access'}
          </button>
        </div>
      </form>

      {!rows ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <Empty>No enrollments yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">Email</th>
                <th className="whitespace-nowrap px-3 py-3">Status</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Since</th>
                <th className="px-3 py-3">Ended</th>
                <th className="whitespace-nowrap px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const label = r.email ?? r.user_id.slice(0, 8);
                const busy = busyId === r.id;
                return (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2.5 text-slate-700">{label}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{r.source}</td>
                    <td className="px-3 py-2.5 text-slate-400">{date(r.access_starts_at)}</td>
                    <td className="px-3 py-2.5 text-slate-400">{date(r.access_ends_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        {r.status === 'enrolled' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              act(
                                'revoke',
                                r,
                                {
                                  title: `Revoke access for ${label}?`,
                                  message:
                                    'The learner keeps their progress but cannot open lessons until access is reinstated.',
                                  confirmLabel: 'Revoke',
                                },
                                'Access revoked.'
                              )
                            }
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-60"
                          >
                            Revoke
                          </button>
                        )}
                        {/* A refund often follows a revoke days later, when the money actually moves. */}
                        {(r.status === 'enrolled' || r.status === 'revoked') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              act(
                                'refund',
                                r,
                                {
                                  title: `Record a refund for ${label}?`,
                                  message:
                                    r.status === 'enrolled'
                                      ? 'This ends access and writes the ledger. Move the money in the Stripe dashboard.'
                                      : 'Access has already ended. This records the refund beside it. Move the money in the Stripe dashboard.',
                                  confirmLabel: 'Record refund',
                                },
                                'Refund recorded. Move the money in the Stripe dashboard.'
                              )
                            }
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-60"
                          >
                            Record refund
                          </button>
                        )}
                        {(r.status === 'revoked' || r.status === 'refunded') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              act(
                                'reinstate',
                                r,
                                { title: `Reinstate access for ${label}?`, confirmLabel: 'Reinstate' },
                                'Access reinstated.'
                              )
                            }
                            className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                          >
                            Reinstate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Content */

function ContentTab({ data }: { data: { rows: LadderRow[]; summary: string } | null }) {
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  const { rows, summary } = data;
  if (rows.length === 0) {
    return <Empty>No lessons found.</Empty>;
  }

  const stillNeeds = (r: LadderRow) => {
    if (r.missing.length > 0) return r.missing.join('; ');
    if (r.next !== null) return 'ready to move up';
    return '';
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{summary}</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-3">Lesson</th>
              <th className="px-3 py-3">Module</th>
              <th className="whitespace-nowrap px-3 py-3">Status</th>
              <th className="px-3 py-3">Next</th>
              <th className="px-3 py-3">Still needs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2.5 text-slate-700">
                  {r.seq}. {r.id} {r.title}
                </td>
                <td className="px-3 py-2.5 text-slate-500">{r.module}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {r.status}
                  </span>
                  {r.videoPlaceholder && <p className="mt-0.5 text-xs text-slate-400">stand-in clip</p>}
                </td>
                <td className="px-3 py-2.5 text-slate-500">{r.next ?? ''}</td>
                <td className="px-3 py-2.5 text-slate-500">{stillNeeds(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
