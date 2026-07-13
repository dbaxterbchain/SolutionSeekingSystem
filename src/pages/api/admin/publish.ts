import type { APIRoute } from 'astro';
import { requireAdmin, adminJson } from '../../../lib/server/adminAuth';
import { serverEnv } from '../../../lib/server/env';
import { clientIp, isRateLimited } from '../../../lib/server/rateLimit';

export const prerender = false;

/**
 * Rebuild the site.
 *
 * Testimonials are read from the database at BUILD time, so approving one
 * changes nothing a visitor can see until the site is rebuilt. That two-step is
 * deliberate: approving is a private, reversible editorial act, while publishing
 * is the moment a named person's words go up on the home page. It also keeps the
 * home page a static file with no runtime database dependency, which is why a
 * Supabase outage cannot take the marketing site down.
 *
 * The corollary is the one to remember: UN-approving also needs a Publish. If
 * somebody withdraws consent, reject the row, press Publish, and confirm it is
 * gone.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);

  const hook = serverEnv('NETLIFY_BUILD_HOOK_URL');
  if (!hook) {
    // Never pretend to have succeeded. A silent no-op here would look exactly
    // like a testimonial that failed to appear, and cost an hour of confusion.
    return adminJson(
      {
        error: 'not_configured',
        message:
          'NETLIFY_BUILD_HOOK_URL is not set, so there is nothing to trigger. Add a build hook in Netlify and set the env var.',
      },
      501
    );
  }

  // A stuck button must not be able to burn the build minutes.
  if (await isRateLimited('admin_publish', clientIp(request, clientAddress), 5, 60 * 60)) {
    return adminJson(
      { error: 'rate_limited', message: 'Too many builds in the last hour. Wait a little.' },
      429
    );
  }

  const res = await fetch(hook, { method: 'POST' }).catch(() => null);
  if (!res || !res.ok) {
    console.error('build hook failed', res?.status);
    return adminJson({ error: 'hook_failed', message: 'Netlify refused the build request.' }, 502);
  }

  console.log('admin action', admin.email, 'triggered a build');
  return adminJson({ ok: true, message: 'Build started. It usually takes about two minutes.' });
};
