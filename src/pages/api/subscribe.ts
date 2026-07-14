import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { clientIp, hashIp, isRateLimited } from '../../lib/server/rateLimit';
import { sendEmail, guideDeliveryEmail } from '../../lib/server/email';

export const prerender = false;

/** Deliberately permissive: rejecting a valid address is worse than storing a typo. */
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

/**
 * KEEP IN STEP WITH `EmailSource` in src/lib/analytics.ts. An unrecognised source
 * is silently rewritten to 'footer' below, so a value that exists on the client
 * and not here is not an error, it is a quietly wrong row in the database.
 *
 * 'chat_wall' is the highest-intent one: they have three messages of a real
 * conversation on screen and have just hit the trial wall.
 */
const SOURCES = ['pdf_guide', 'footer', 'pricing', 'chat_wall'] as const;

/**
 * Join the email list.
 *
 * Double opt-in, but the confirmation click IS the download click (see
 * /api/confirm), so it costs the reader nothing: only a real address gets the
 * guide, and there is no second step that feels like one.
 *
 * ALWAYS returns 200 on a well-formed request, whether the address is new,
 * already pending, or already confirmed. Otherwise this endpoint becomes an
 * oracle for testing whether a given person is on the list.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'bad_request' }, 400);

  // Bots fill hidden fields. Answer 200 so they learn nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
  if (!looksLikeEmail(email)) return json({ error: 'invalid_email' }, 400);

  const source = SOURCES.includes(body.source as (typeof SOURCES)[number])
    ? (body.source as string)
    : 'footer';

  const ip = clientIp(request, clientAddress);
  if (await isRateLimited('subscribe', ip, 5, 60 * 60)) {
    // Still 200: a bot shouldn't be able to tell a rate limit from a success.
    return json({ ok: true });
  }

  const { data: existing } = await supabaseAdmin
    .from('email_subscribers')
    .select('id, status, token')
    .eq('email', email)
    .maybeSingle();

  // Already confirmed: don't email them again, and don't say so either.
  if (existing?.status === 'confirmed') return json({ ok: true });

  const token = existing?.token ?? randomUUID();
  const user = await getUserFromRequest(request);
  const userId = user && !user.is_anonymous ? user.id : null;
  const ipHash = ip ? hashIp(ip) : null;

  // Insert and update are separate on purpose: an upsert would overwrite `source`
  // with whichever form they used last, destroying the first-touch attribution
  // that tells us which capture point actually works.
  const { error } = existing
    ? await supabaseAdmin
        .from('email_subscribers')
        // Re-subscribing after unsubscribing is a fresh opt-in, so status resets.
        .update({ status: 'pending', user_id: userId, ip_hash: ipHash })
        .eq('id', existing.id)
    : await supabaseAdmin.from('email_subscribers').insert({
        email,
        source,
        token,
        status: 'pending',
        user_id: userId,
        ip_hash: ipHash,
      });

  if (error) {
    console.error('subscribe write failed', error);
    return json({ error: 'server_error' }, 500);
  }

  const origin = new URL(request.url).origin;
  const mail = guideDeliveryEmail({
    confirmUrl: `${origin}/api/confirm?token=${token}`,
    unsubscribeUrl: `${origin}/api/unsubscribe?token=${token}`,
    guideUrl: `${origin}/practice/guide?utm_source=email&utm_campaign=guide_delivery`,
  });

  await sendEmail({
    to: email,
    ...mail,
    // A retried request must not send the guide twice.
    idempotencyKey: `guide-delivery/${token}`,
  });

  return json({ ok: true });
};
