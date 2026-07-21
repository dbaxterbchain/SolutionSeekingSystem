import { useEntitlement } from '../../lib/entitlement';

/**
 * A "Dashboard" nav link shown only to subscribers. It is a convenience, not a
 * gate: the dashboard page and /api/chat enforce access themselves, so this
 * fails CLOSED (renders nothing) while the entitlement lookup is loading or if
 * it fails. Worst case a subscriber briefly navigates via /account instead.
 */
export default function DashboardNavLink({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { entitlement } = useEntitlement();
  if (entitlement?.kind !== 'subscriber') return null;

  if (variant === 'mobile') {
    return (
      <a
        href="/dashboard"
        className="rounded-xl px-4 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Dashboard
      </a>
    );
  }

  return (
    <a
      href="/dashboard"
      className="rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap text-slate-600 transition-colors hover:bg-slate-50 hover:text-ink-800"
    >
      Dashboard
    </a>
  );
}
