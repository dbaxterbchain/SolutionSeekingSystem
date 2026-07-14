/**
 * Where a visitor actually came from, remembered from their FIRST touch.
 *
 * The problem this exists for: an ad click arrives as `?gclid=...` on the landing
 * page, but the money event happens much later, after the visitor has chatted
 * anonymously, signed up (which REDIRECTS OFF-SITE TO GOOGLE and destroys the
 * query string), hit the paywall, and paid. Reading `?gclid` at checkout time
 * captures precisely nothing. It has to be caught on arrival and kept.
 *
 * localStorage rather than sessionStorage, for the same reason `SIGNUP_FLAG` in
 * analytics.ts uses it: the journey crosses an OAuth round trip and can cross a
 * new tab (an email confirmation link). sessionStorage is per-tab and would lose
 * exactly the conversions we paid for.
 *
 * Nothing here is a secret and nothing here is a credential. It is a label on a
 * visit, so failing to store it costs us a row in a report, never a feature.
 */

const KEY = 'sss-first-touch';

/** 30 days: the Google Ads default conversion window. Longer just invites misattribution. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Per-field cap. These end up in Stripe metadata, which has hard limits. */
const MAX_FIELD = 200;

/** Google sends gbraid/wbraid instead of gclid for some iOS and app-to-web journeys. */
const CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid'] as const;
export type ClickSource = (typeof CLICK_PARAMS)[number];

const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export interface FirstTouch {
  /** The raw click id. An offline conversion import is keyed on exactly this string. */
  click_id?: string;
  /** Which param it arrived in, because an import needs to know the column. */
  click_source?: ClickSource;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** The KEYWORD. The most valuable field here: it says which search we paid for. */
  utm_term?: string;
  utm_content?: string;
  /** Which page the ad actually bought, e.g. /practice/modes/manager. */
  landing_path?: string;
  at: number;
}

/**
 * Keep printable characters only. These strings travel into Stripe metadata,
 * which is no place for a smuggled newline or a control byte. Done as a codepoint
 * filter rather than a regex so that no control characters appear in this source
 * file either.
 */
const printable = (value: string): string => {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out;
};

const clean = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = printable(value).trim().slice(0, MAX_FIELD);
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Record where this visit came from, if it came from anywhere identifiable.
 *
 * Called on every page load (from BaseLayout), so it has to be careful about what
 * it is willing to overwrite:
 *
 *  - No click id and no utm at all? Write NOTHING. An organic pageview must not
 *    erase the ad click that brought them here yesterday.
 *  - A stored touch already exists? First touch wins, with ONE exception.
 *  - THE EXCEPTION: a real paid click always beats a stored non-paid touch. Our
 *    own guide-delivery email links back with `?utm_source=email`
 *    (src/pages/api/subscribe.ts), so without this clause our own email could
 *    quietly claim credit for a conversion an ad actually bought, and the ad test
 *    would under-report itself with no error anywhere.
 */
export function captureFirstTouch(): void {
  if (typeof window === 'undefined') return;

  try {
    const params = new URLSearchParams(window.location.search);

    let click_id: string | undefined;
    let click_source: ClickSource | undefined;
    for (const name of CLICK_PARAMS) {
      const value = clean(params.get(name));
      if (value) {
        click_id = value;
        click_source = name;
        break;
      }
    }

    const utm: Record<string, string | undefined> = {};
    for (const name of UTM_PARAMS) utm[name] = clean(params.get(name));
    const hasUtm = UTM_PARAMS.some((name) => utm[name]);

    // Nothing to record. Leave whatever is already there alone.
    if (!click_id && !hasUtm) return;

    const existing = getFirstTouch();
    if (existing) {
      const upgradingToPaid = Boolean(click_id) && !existing.click_id;
      if (!upgradingToPaid) return; // First touch wins.
    }

    const touch: FirstTouch = {
      ...(click_id ? { click_id, click_source } : {}),
      ...utm,
      landing_path: window.location.pathname.slice(0, MAX_FIELD),
      at: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(touch));
  } catch {
    // Private mode, or storage disabled. We lose a label, not a sale.
  }
}

/** The stored first touch, or null when absent or older than the conversion window. */
export function getFirstTouch(): FirstTouch | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const touch = JSON.parse(raw) as FirstTouch;
    if (!touch?.at || Date.now() - touch.at > TTL_MS) return null;
    return touch;
  } catch {
    return null;
  }
}
