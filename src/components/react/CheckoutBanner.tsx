import { useEffect, useState } from 'react';
import { track } from '../../lib/analytics';

/**
 * Recovery for an abandoned Stripe checkout. Stripe sends the user back to the
 * page they left from with ?checkout=cancelled; before this, that param was set
 * and then silently ignored — no message, no event, no second chance.
 *
 * Mounted once in BaseLayout, so every page is covered.
 */
export default function CheckoutBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('checkout') !== 'cancelled') return;

    track({ event: 'checkout_abandoned' });
    setShow(true);

    // Strip the param so a refresh or a shared link doesn't re-show the banner.
    url.searchParams.delete('checkout');
    window.history.replaceState(null, '', url);
  }, []);

  if (!show) return null;

  return (
    <div className="border-b border-amber-100 bg-amber-50">
      <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-sm text-amber-900">
          No charge was made, and your conversation is right where you left it. Not sure yet?{' '}
          <a href="/practice/demos" className="font-semibold underline hover:text-amber-950">
            See what a full conversation produces
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
