import type { AgentId } from './chatSessions';

/**
 * The funnel event layer. Every user-facing action that matters pushes a typed
 * event onto GTM's dataLayer from here, and nowhere else.
 *
 * Rules that keep this honest:
 * - The union below IS the taxonomy. A typo is a type error, and there is one
 *   place to look up what we measure. Add events here, not inline.
 * - Never throw and never assume GTM loaded: ad blockers routinely strip it,
 *   and analytics must never break the product.
 * - `subscription_completed` is deliberately NOT here. The money event is sent
 *   server-side from the Stripe webhook (src/lib/server/ga4.ts), because a
 *   browser event undercounts exactly where it matters (closed tabs, blockers,
 *   iOS hand-off) and biases any ad bidding built on it.
 */

/** Where a CTA lives. A closed set, so "which button" stays analyzable. */
export type CtaLocation =
  | 'home_hero'
  | 'home_proof'
  | 'home_closing'
  | 'nav'
  | 'footer'
  | 'practice_assistants'
  | 'practice_modes'
  | 'practice_demos'
  | 'guide_page'
  | 'mentor_page'
  | 'mode_page'
  | 'mode_page_mentor'
  | 'demo_page_sidebar'
  | 'demo_page_end'
  | 'paywall_card'
  | 'account_subscription'
  | 'pricing_monthly'
  | 'pricing_annual'
  | 'pricing_team'
  | 'dashboard_upsell';

/** Which allowance the user is spending. */
export type Tier = 'anon' | 'free' | 'subscriber';

export type PlanId = 'monthly' | 'annual' | 'team';

/**
 * Where an email address was captured.
 *
 * KEEP THIS IN STEP WITH `SOURCES` in src/pages/api/subscribe.ts. They are two
 * independent lists, and the server silently rewrites an unrecognised source to
 * 'footer'. Add a value to one and not the other and the client reports one
 * thing while the database records another, with no error anywhere.
 */
export type EmailSource = 'pdf_guide' | 'footer' | 'pricing' | 'chat_wall';

export type AnalyticsEvent =
  | { event: 'cta_clicked'; cta_location: CtaLocation; cta_label: string; destination?: string }
  | { event: 'demo_viewed'; demo_id: string; agent: AgentId }
  | { event: 'mode_viewed'; mode_id: string }
  | { event: 'signup_started'; method: 'google' | 'email'; from_anon: boolean }
  | { event: 'signup_completed'; method: 'google' | 'email'; from_anon: boolean }
  /** A visitor started chatting with no account (top of the funnel). */
  | { event: 'anon_chat_started'; agent: AgentId; mode?: string }
  | { event: 'first_message_sent'; agent: AgentId; tier: Tier; mode?: string }
  | { event: 'message_sent'; agent: AgentId; tier: Tier; message_index: number }
  | { event: 'free_limit_reached'; tier: Exclude<Tier, 'subscriber'>; agent: AgentId }
  | { event: 'checkout_started'; plan: PlanId; cta_location: CtaLocation; value: number; currency: 'USD' }
  | { event: 'checkout_abandoned' }
  | { event: 'checkout_success_viewed' }
  /** Demand signal for the team tier, which is deliberately not self-serve yet. */
  | { event: 'team_enquiry_submitted' }
  /** An address joined the list (the delivery email is on its way). */
  | { event: 'email_captured'; source: EmailSource }
  /**
   * The quality signal. Asked once, when a conversation reaches a prep summary
   * (i.e. it actually finished the protocol). Everyone who answers tells us the
   * hit rate, not just the people who go on to write a testimonial: "not yet" is
   * the more valuable answer of the two, and the only one we would never
   * otherwise hear.
   */
  | { event: 'feedback_given'; helpful: boolean; agent: AgentId; tier: Tier }
  /** A real, quotable testimonial arrived. `consented` = publishable by us. */
  | { event: 'testimonial_submitted'; agent: AgentId; consented: boolean };

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/** Push a funnel event to GTM. Safe to call anywhere, including during SSR. */
export function track(payload: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  try {
    (window.dataLayer ??= []).push({ ...payload });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', payload.event, payload);
    }
  } catch {
    // Analytics must never break the product.
  }
}

/**
 * The GA4 client/session ids, read from the cookies GA sets. We pass these
 * through Stripe metadata so the server-side conversion can be attributed to
 * the browser session that started it. Without this stitching every purchase
 * lands in GA4 as an unattributed "direct" visit and paid campaigns can't be
 * evaluated at all.
 */
export function getGaIds(): { client_id?: string; session_id?: string } {
  if (typeof document === 'undefined') return {};
  try {
    const cookies = document.cookie.split('; ');
    const read = (name: string) =>
      cookies.find((c) => c.startsWith(`${name}=`))?.split('=').slice(1).join('=');

    // _ga=GA1.1.<part1>.<part2>  ->  client_id "<part1>.<part2>"
    const gaParts = read('_ga')?.split('.');
    const client_id = gaParts && gaParts.length >= 4 ? gaParts.slice(2).join('.') : undefined;

    // The session cookie is _ga_<STREAM>, where STREAM is the measurement id
    // minus "G-". Fall back to whichever _ga_* cookie is present so a missing
    // PUBLIC_GA4_MEASUREMENT_ID costs us attribution, not the whole session id.
    const measurementId = import.meta.env.PUBLIC_GA4_MEASUREMENT_ID as string | undefined;
    const named = measurementId ? read(`_ga_${measurementId.replace(/^G-/, '')}`) : undefined;
    const session =
      named ?? cookies.find((c) => c.startsWith('_ga_'))?.split('=').slice(1).join('=');

    // Two formats in the wild:
    //   GS1.1.<session_id>.<n>...            (older)
    //   GS2.1.s<session_id>$o2$g1$t...       (current: fields are $-delimited)
    let session_id: string | undefined;
    const field = session?.split('.')[2];
    if (field) {
      const raw = field.split('$')[0];
      session_id = /^s\d+$/.test(raw) ? raw.slice(1) : /^\d+$/.test(raw) ? raw : undefined;
    }

    return { client_id, session_id };
  } catch {
    return {};
  }
}

/**
 * Signup spans a redirect (Google OAuth) or an email round trip, so the
 * "completed" event can't be fired where it started. We stash the method when
 * signup begins and consume it when a session first appears.
 *
 * localStorage, not sessionStorage: an email confirmation link usually opens a
 * NEW TAB, and sessionStorage is per-tab, so email signups would go uncounted.
 * The timestamp keeps a stale flag from attributing an unrelated sign-in weeks
 * later.
 */
const SIGNUP_FLAG = 'sss-signup-pending';
const SIGNUP_FLAG_TTL_MS = 6 * 60 * 60 * 1000;

export function markSignupStarted(method: 'google' | 'email', fromAnon = false): void {
  if (typeof window === 'undefined') return;
  track({ event: 'signup_started', method, from_anon: fromAnon });
  try {
    window.localStorage.setItem(
      SIGNUP_FLAG,
      JSON.stringify({ method, fromAnon, at: Date.now() })
    );
  } catch {
    // Private mode / storage disabled: we lose the completion event, not the signup.
  }
}

/** Fire `signup_completed` if this session is the result of a signup we started. */
export function consumeSignupCompleted(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(SIGNUP_FLAG);
    if (!raw) return;
    window.localStorage.removeItem(SIGNUP_FLAG);
    const { method, fromAnon, at } = JSON.parse(raw) as {
      method: 'google' | 'email';
      fromAnon: boolean;
      at: number;
    };
    if (!at || Date.now() - at > SIGNUP_FLAG_TTL_MS) return;
    track({ event: 'signup_completed', method, from_anon: Boolean(fromAnon) });
  } catch {
    // Malformed flag: drop it silently.
  }
}

/**
 * One delegated click listener for `data-track` attributes, so static Astro
 * pages can instrument a link without shipping a React island for it:
 *
 *   <a href="/practice/guide" data-track-cta="home_hero" data-track-label="Talk to the Guide">
 */
export function initDomTracking(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-track-cta]') as HTMLElement | null;
    if (!el) return;
    track({
      event: 'cta_clicked',
      cta_location: el.dataset.trackCta as CtaLocation,
      cta_label: el.dataset.trackLabel ?? el.textContent?.trim().slice(0, 60) ?? '',
      destination: el.getAttribute('href') ?? undefined,
    });
  });
}
