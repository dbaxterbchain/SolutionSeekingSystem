/**
 * Cloudflare Turnstile tokens for Supabase Auth.
 *
 * Captcha protection is enabled on the Supabase project, which means the auth
 * endpoints REJECT calls without a token: anonymous sign-in, sign-up, sign-in,
 * password reset, and confirmation resend. Every one of those call sites has to
 * pass `options: { captchaToken }`.
 *
 * The widget runs in invisible mode (`execution: 'execute'` +
 * `appearance: 'interaction-only'`), so a visitor sees nothing at all unless
 * Cloudflare decides they need to prove they're human. That matters most for the
 * anonymous trial, whose entire point is that you can just start typing.
 *
 * Tokens are single-use and expire, so we reset and re-execute for every call
 * rather than caching one.
 */

const SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Cloudflare's challenge should resolve in well under this; past it, something is wrong. */
const TOKEN_TIMEOUT_MS = 30_000;

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string, options?: Record<string, unknown>): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** False locally (and in any environment without a site key), where captcha is off. */
export const isCaptchaEnabled = Boolean(SITE_KEY);

let scriptPromise: Promise<void> | null = null;
let widgetId: string | null = null;
/** Resolver for the challenge currently in flight. */
let pending: { resolve: (token: string) => void; reject: (err: Error) => void } | null = null;

function loadScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('no document'));
  return (scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null; // allow a retry on the next attempt
      reject(new Error('Could not load the captcha. Check your connection or any blockers.'));
    };
    document.head.appendChild(script);
  }));
}

function ensureWidget(): string {
  if (widgetId) return widgetId;
  const api = window.turnstile;
  if (!api) throw new Error('Captcha unavailable.');

  // The container must stay in the DOM and visible: in interaction-only mode an
  // actual challenge renders into it, and display:none would leave the user with
  // an invisible puzzle they cannot solve. It occupies no space until then.
  const container = document.createElement('div');
  container.id = 'turnstile-container';
  container.style.cssText =
    'position:fixed;bottom:1rem;right:1rem;z-index:80;display:flex;justify-content:flex-end;';
  document.body.appendChild(container);

  widgetId = api.render(container, {
    sitekey: SITE_KEY,
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token: string) => {
      pending?.resolve(token);
      pending = null;
    },
    'error-callback': () => {
      pending?.reject(new Error('The captcha could not be completed. Please try again.'));
      pending = null;
      return true;
    },
    'expired-callback': () => {
      pending?.reject(new Error('The captcha expired. Please try again.'));
      pending = null;
    },
  });
  return widgetId;
}

/**
 * Solving the challenge takes over a second, and that would land squarely on the
 * critical path of the first message a stranger ever sends. So we solve one in
 * advance and hold it.
 *
 * Turnstile tokens last ~300s and are single-use, so a cached one is discarded
 * the moment it's handed out (and well before it can go stale).
 */
const TOKEN_TTL_MS = 240_000;
let cached: { token: string; at: number } | null = null;

/**
 * Fetch a token ahead of time. Best-effort: failures are swallowed, because a
 * slow warm-up must never surface as an error to a visitor who hasn't done
 * anything yet. The real attempt on Send reports properly.
 */
export function prewarmCaptcha(): void {
  if (!isCaptchaEnabled || cached) return;
  void solve()
    .then((token) => {
      cached = { token, at: Date.now() };
    })
    .catch(() => {
      // Fetched on demand instead.
    });
}

/**
 * A fresh Turnstile token, or undefined where captcha isn't configured (local
 * development), in which case Supabase isn't enforcing it either.
 *
 * Throws if a token is required but can't be obtained, so callers surface a real
 * error instead of sending a request Supabase will reject with a confusing
 * "captcha protection: request disallowed".
 */
export async function getCaptchaToken(): Promise<string | undefined> {
  if (!isCaptchaEnabled) return undefined;

  // Spend the pre-solved token if we have a live one. It is single-use, so it is
  // consumed here regardless of what happens next.
  const warm = cached;
  cached = null;
  if (warm && Date.now() - warm.at < TOKEN_TTL_MS) {
    // Start solving the next one now, so a second auth call is instant too.
    prewarmCaptcha();
    return warm.token;
  }

  return solve();
}

/** Run the challenge and resolve with a token. */
async function solve(): Promise<string> {
  await loadScript();
  const api = window.turnstile;
  if (!api) throw new Error('Captcha unavailable.');
  const id = ensureWidget();

  // Never reuse a token: they are single-use and short-lived.
  api.reset(id);

  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending = null;
      reject(new Error('The captcha timed out. Please try again.'));
    }, TOKEN_TIMEOUT_MS);

    pending = {
      resolve: (token) => {
        window.clearTimeout(timer);
        resolve(token);
      },
      reject: (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    };

    try {
      api.execute(id);
    } catch (err) {
      window.clearTimeout(timer);
      pending = null;
      reject(err instanceof Error ? err : new Error('Captcha failed.'));
    }
  });
}
