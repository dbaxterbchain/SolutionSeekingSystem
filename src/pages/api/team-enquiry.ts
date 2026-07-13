import type { APIRoute } from 'astro';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { clientIp, isRateLimited, hashIp } from '../../lib/server/rateLimit';
import { sendEmail, teamEnquiryAlertEmail } from '../../lib/server/email';
import { serverEnv } from '../../lib/server/env';

export const prerender = false;

const MAX = { name: 120, email: 254, team_size: 40, note: 2000 };

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Deliberately permissive: rejecting valid addresses is worse than storing a typo. */
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

/** Team plan enquiries from /pricing. Stored, and emailed so they aren't missed. */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'bad_request' }, 400);

  // Bots fill hidden fields. Answer 200 so they learn nothing from the response.
  if (clean(body.website, 100) !== '') return json({ ok: true });

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  if (!name || !looksLikeEmail(email)) {
    return json({ error: 'invalid' }, 400);
  }

  const ip = clientIp(request, clientAddress);
  if (await isRateLimited('team_enquiry', ip, 5, 60 * 60)) {
    return json({ error: 'rate_limited' }, 429);
  }

  // Signed in? Attach the account, so a follow-up isn't a guessing game.
  const user = await getUserFromRequest(request);

  const teamSize = clean(body.team_size, MAX.team_size) || null;
  const note = clean(body.note, MAX.note) || null;

  const { data: row, error } = await supabaseAdmin
    .from('team_enquiries')
    .insert({
      name,
      email,
      team_size: teamSize,
      note,
      user_id: user && !user.is_anonymous ? user.id : null,
      ip_hash: ip ? hashIp(ip) : null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('team enquiry insert failed', error);
    return json({ error: 'server_error' }, 500);
  }

  // Alert, so an enquiry never sits unread in a table. The row is already saved,
  // so a failed send costs the notification, not the lead.
  const to = serverEnv('TEAM_ENQUIRY_TO') || serverEnv('EMAIL_FROM');
  if (to) {
    await sendEmail({
      to,
      ...teamEnquiryAlertEmail({ name, email, teamSize, note }),
      idempotencyKey: `team-enquiry/${row.id}`,
    });
  }

  return json({ ok: true });
};
