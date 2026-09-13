import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { track } from '../../lib/analytics';
import {
  CourseActionError,
  confirmCertificateName,
  courseErrorMessage,
  fetchCertificate,
  setCertificateSharing,
  type CertificatePayload,
  type CertificateRecord,
} from '../../lib/courseClient';
import { DISPLAY_NAME_MAX, normalizeDisplayName } from '../../lib/course/certificateRules';

/**
 * The learner's certificate page. Everything comes from GET /api/course/
 * certificate with the bearer token; the prerendered shell carries only the
 * certification's public strings. Four states: no certificate (with the
 * honest reason), a certificate waiting for its name, an issued certificate
 * (the printable sheet and the verification link), and a revoked one.
 */

interface Props {
  certificationTitle: string;
  method: string;
  meaning: string;
  supportContact: string;
}

const PAGE_PATH = '/course/learn/certificate/';
const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const messageFor = (err: unknown) => (err instanceof CourseActionError ? courseErrorMessage(err.code) : 'Something went wrong. Please try again.');

export default function CertificateView(props: Props) {
  const { session, loading } = useSession();
  const [payload, setPayload] = useState<CertificatePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = session?.access_token ?? null;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchCertificate(token)
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(messageFor(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const run = useCallback(
    async (action: (accessToken: string) => Promise<CertificatePayload>) => {
      if (!token || busy) return;
      setBusy(true);
      setActionError(null);
      try {
        setPayload(await action(token));
      } catch (err) {
        setActionError(messageFor(err));
      } finally {
        setBusy(false);
      }
    },
    [token, busy]
  );

  const confirmName = (name: string) =>
    run(async (accessToken) => {
      const next = await confirmCertificateName(accessToken, name);
      // Once per certificate: the server refuses a second confirmation.
      track({ event: 'certificate_issued' });
      return next;
    });
  const share = (active: boolean) => run((accessToken) => setCertificateSharing(accessToken, active));

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!session) {
    return (
      <p className="text-slate-700">
        <a href={accountLink({ next: PAGE_PATH })} className="font-semibold text-brand-700 underline">
          Sign in
        </a>{' '}
        to see your certificate.
      </p>
    );
  }
  if (loadError) return <ErrorLine text={loadError} />;
  if (!payload) return <p className="text-slate-500">Loading…</p>;

  const { certificate } = payload;
  return (
    <div>
      <p className="eyebrow">{props.certificationTitle}</p>
      <h1 className="mt-2 font-heading text-3xl font-bold text-ink-800">Your certificate</h1>
      {!certificate && <NoCertificate payload={payload} />}
      {certificate && certificate.status === 'revoked' && <Revoked certificate={certificate} supportContact={props.supportContact} />}
      {certificate && certificate.status === 'active' && !certificate.name_confirmed_at && <NameForm busy={busy} error={actionError} onConfirm={confirmName} />}
      {certificate && certificate.status === 'active' && certificate.name_confirmed_at && (
        <Issued certificate={certificate} busy={busy} error={actionError} onShare={share} certificationTitle={props.certificationTitle} method={props.method} meaning={props.meaning} />
      )}
    </div>
  );
}

function NoCertificate({ payload }: { payload: CertificatePayload }) {
  if (payload.passed_current && payload.awards_enabled) {
    return <p className="mt-4 text-slate-700">Your pass is recorded. Your certificate has not been issued yet and will appear here when it is.</p>;
  }
  if (payload.passed_current) {
    return <p className="mt-4 text-slate-700">Certificates are not being issued yet. Your pass is recorded against your account and will be awarded when they open.</p>;
  }
  return (
    <p className="mt-4 text-slate-700">
      There is no certificate on this account yet. It is awarded when you pass the{' '}
      <a href="/course/learn/assessment/" className="font-semibold text-brand-700 underline">
        final assessment
      </a>
      .
    </p>
  );
}

function Revoked({ certificate, supportContact }: { certificate: CertificateRecord; supportContact: string }) {
  return (
    <section className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-slate-700">
        Certificate {certificate.serial} was revoked{certificate.revoked_at ? ` on ${dateOf(certificate.revoked_at)}` : ''}. Its verification link no longer resolves.
      </p>
      <p className="mt-3 text-slate-700">
        If that seems wrong, write to{' '}
        <a href={`mailto:${supportContact}`} className="font-semibold text-brand-700 underline">
          {supportContact}
        </a>
        .
      </p>
    </section>
  );
}

function NameForm({ busy, error, onConfirm }: { busy: boolean; error: string | null; onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = normalizeDisplayName(name);
    if (!clean) {
      setProblem(`Enter the name as it should appear, up to ${DISPLAY_NAME_MAX} characters.`);
      return;
    }
    setProblem(null);
    onConfirm(clean);
  };
  return (
    <form onSubmit={submit} className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-heading text-xl font-bold text-ink-800">Confirm the name for your certificate</h2>
      <p className="mt-2 text-slate-700">This is the name printed on the certificate and shown to anyone who opens its verification link. It is set once, so check the spelling.</p>
      <label className="mt-4 block text-sm font-semibold text-slate-700">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
          required
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-normal"
        />
      </label>
      {problem && <ErrorLine text={problem} />}
      {error && <ErrorLine text={error} />}
      <button type="submit" className="btn-primary mt-4" disabled={busy}>
        {busy ? 'Saving…' : 'Confirm name'}
      </button>
    </form>
  );
}

function Issued({
  certificate,
  busy,
  error,
  onShare,
  certificationTitle,
  method,
  meaning,
}: {
  certificate: CertificateRecord;
  busy: boolean;
  error: string | null;
  onShare: (active: boolean) => void;
  certificationTitle: string;
  method: string;
  meaning: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!certificate.share_url) return;
    try {
      await navigator.clipboard.writeText(certificate.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is on screen to select by hand.
    }
  };
  return (
    <div>
      <div className="no-print mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => window.print()} className="btn-primary">
          Print or save as PDF
        </button>
        <a href="/course/learn/" className="btn-secondary">
          Back to your course
        </a>
      </div>
      <article className="certificate-sheet mt-6 rounded-2xl border border-slate-200 bg-white p-8 sm:p-12" aria-label={`${certificationTitle}, awarded to ${certificate.display_name}`}>
        <p className="eyebrow">{certificationTitle}</p>
        <p className="mt-8 text-sm uppercase tracking-wide text-slate-500">Awarded to</p>
        <p className="mt-2 font-heading text-4xl font-bold text-ink-800">{certificate.display_name}</p>
        <p className="mt-8 max-w-xl text-slate-700">{meaning}</p>
        <p className="mt-6 text-sm text-slate-500">{method}</p>
        <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Issued</dt>
            <dd className="font-semibold text-ink-800">{dateOf(certificate.issued_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Version</dt>
            <dd className="font-semibold text-ink-800">{certificate.certification_version}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Serial</dt>
            <dd className="font-semibold text-ink-800">{certificate.serial}</dd>
          </div>
        </dl>
        {certificate.share_url && <p className="mt-8 break-all text-sm text-slate-500">Verify at {certificate.share_url}</p>}
      </article>
      <section className="no-print mt-8 max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-heading text-xl font-bold text-ink-800">Verification link</h2>
        {certificate.share_active && certificate.share_url ? (
          <>
            <p className="mt-2 text-slate-700">Anyone with this link sees your name, the certification, its version, the issue date and the serial. Nothing else.</p>
            <p className="mt-3 break-all rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm text-ink-800">{certificate.share_url}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="btn-secondary" onClick={copy}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => onShare(false)}>
                {busy ? 'Saving…' : 'Turn the link off'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-slate-700">The link is off. Turn it on to get a page that confirms this certificate. Turning it off later stops the same link until you turn it on again.</p>
            <button type="button" className="btn-primary mt-4" disabled={busy} onClick={() => onShare(true)}>
              {busy ? 'Saving…' : 'Turn the link on'}
            </button>
          </>
        )}
        {error && <ErrorLine text={error} />}
      </section>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
      {text}
    </p>
  );
}
