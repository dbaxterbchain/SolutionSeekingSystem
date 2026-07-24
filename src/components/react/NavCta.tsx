import { useEntitlement } from '../../lib/entitlement';

/**
 * The primary nav CTA. Subscribers get a "Dashboard" button (their real home);
 * everyone else (free, signed-out, anonymous, still-loading, or a failed
 * entitlement lookup) gets "Talk to the Guide". It fails OPEN to the public CTA
 * so there is always a button: it server-renders as "Talk to the Guide" and
 * swaps to "Dashboard" after the client-side entitlement check for subscribers.
 */
export default function NavCta({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { entitlement } = useEntitlement();
  const isSubscriber = entitlement?.kind === 'subscriber';

  const href = isSubscriber ? '/dashboard' : '/practice/guide';
  const label = isSubscriber ? 'Dashboard' : 'Talk to the Guide';
  const className =
    variant === 'mobile'
      ? 'btn-primary mt-2'
      : 'btn-primary hidden whitespace-nowrap sm:inline-flex';

  return (
    <a href={href} className={className} data-track-cta="nav" data-track-label={label}>
      {label}
    </a>
  );
}
