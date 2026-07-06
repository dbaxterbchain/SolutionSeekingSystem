import { useIsSubscriber } from '../../lib/subscription';

/**
 * State-aware pricing copy for the static assistant pages. Server-renders
 * (and shows non-subscribers) the generic offer text — so the prerendered
 * HTML keeps the pricing for visitors and crawlers — and swaps to the
 * subscriber text once an active subscription is confirmed client-side.
 */
export default function PricingLine({
  generic,
  subscriber,
}: {
  generic: string;
  subscriber: string;
}) {
  return <>{useIsSubscriber() ? subscriber : generic}</>;
}
