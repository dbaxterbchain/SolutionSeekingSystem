import type { APIRoute } from 'astro';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { clientIp, hashIp, isRateLimited } from '../../lib/server/rateLimit';
import { sendEmail, feedbackAlertEmail, internalAlertTo } from '../../lib/server/email';

export const prerender = false;

const MAX = { name: 80, role: 120, quote: 1200, note: 1200 };

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * "Did this help?" answered.
 *
 * Two things arrive here, and they are not the same thing:
 *   - `helpful`, always. The quality signal, and the real point of this
 *     endpoint. "Not yet" is worth more than a testimonial we never get, and it
 *     is the answer nobody sends unprompted.
 *   - words, sometimes: a quote that may become social proof, or a note saying
 *     what was missing.
 *
 * TWO-STEP ON PURPOSE. The click records the rating and returns the row id; the
 * form (if they bother) attaches words to that same row. Recording only on
 * submit would throw away the rating of everyone who abandons the form, which is
 * most people, and they are exactly the population we are trying to measure.
 *
 * Nothing publishes automatically: `status` starts at 'new', and the table's
 * check constraint refuses to approve any row lacking consent and a quote.
 *
 * Requires a session (anonymous is fine, and expected: trial users are the top
 * of the funnel). No session means no conversation, so there is nothing to rate.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'bad_request' }, 400);

  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const ip = clientIp(request, clientAddress);
  // Generous: someone legitimately finishing several conversations must never be
  // told to be quiet. This only stops a script hammering the table.
  if (await isRateLimited('testimonial', ip, 20, 60 * 60)) {
    return json({ error: 'rate_limited' }, 429);
  }

  const quote = clean(body.quote, MAX.quote) || null;
  const note = clean(body.note, MAX.note) || null;
  const displayName = clean(body.display_name, MAX.name) || null;
  const roleTitle = clean(body.role_title, MAX.role) || null;
  // Consent means nothing without a quote, and only counts when explicitly true.
  const consentPublish = body.consent_publish === true && quote !== null;

  /* Step 2: attach words to a rating already recorded. Scoped to this user's own
     row, so a guessed id cannot put words in someone else's mouth. */
  if (typeof body.id === 'string') {
    const { data, error } = await supabaseAdmin
      .from('testimonials')
      .update({
        display_name: displayName,
        role_title: roleTitle,
        quote,
        note,
        consent_publish: consentPublish,
      })
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select('id, helpful, agent')
      .maybeSingle();

    if (error) {
      console.error('testimonial update failed', error);
      return json({ error: 'server_error' }, 500);
    }
    if (!data) return json({ error: 'not_found' }, 404);

    await alert({ ...data, quote, note, displayName, roleTitle, consentPublish });
    return json({ ok: true, id: data.id });
  }

  /* Step 1: the rating itself. */
  if (typeof body.helpful !== 'boolean') return json({ error: 'invalid' }, 400);
  const agent = body.agent === 'guide' || body.agent === 'mentor' ? body.agent : null;
  if (!agent) return json({ error: 'invalid' }, 400);

  const { data, error } = await supabaseAdmin
    .from('testimonials')
    .insert({
      helpful: body.helpful,
      agent,
      context: clean(body.context, 60) || null,
      message_count: typeof body.message_count === 'number' ? body.message_count : null,
      // Recorded for anonymous users too: the FK's `on delete set null` releases
      // it when the nightly anon cleanup reaps them, and until then it lets the
      // rating be joined to the conversation that produced it.
      user_id: user.id,
      is_anonymous: user.is_anonymous === true,
      chat_id: typeof body.chat_id === 'string' ? body.chat_id : null,
      ip_hash: ip ? hashIp(ip) : null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('testimonial insert failed', error);
    return json({ error: 'server_error' }, 500);
  }

  return json({ ok: true, id: data.id });
};

/** Email only when there are words to read. A bare rating is a number, not news. */
async function alert(f: {
  helpful: boolean;
  agent: string;
  quote: string | null;
  note: string | null;
  displayName: string | null;
  roleTitle: string | null;
  consentPublish: boolean;
}) {
  const to = internalAlertTo();
  if (!to || (!f.quote && !f.note)) return;
  await sendEmail({
    to,
    ...feedbackAlertEmail({
      ...f,
      adminUrl: 'Review in Supabase: table `testimonials`, status = new.',
    }),
  });
}
