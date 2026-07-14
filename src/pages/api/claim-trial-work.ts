import type { APIRoute } from 'astro';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { clientIp, isRateLimited } from '../../lib/server/rateLimit';

export const prerender = false;

/**
 * Move a trial user's work onto the account they just signed in to.
 *
 * The case this exists for: somebody chats anonymously, then signs in to an
 * account they already had. Registering converts the anonymous user in place and
 * keeps the same id, so the conversation follows them with no code at all.
 * Signing in does not: it is a different user, and the trial conversation stayed
 * behind, unreachable, with nothing to tell them so.
 *
 * THE SECURITY PROPERTY, and the only thing that makes this safe: the caller
 * must prove they hold BOTH sessions. The new account's JWT arrives in the
 * Authorization header, and the anonymous user's JWT in the body. Possession of
 * the anonymous JWT is what proves that trial was theirs. Without that, this
 * endpoint would be "give me any stranger's conversation, if you can guess a
 * user id", which is the obvious way to build this and completely wrong.
 *
 * `ai_usage` is deliberately NOT merged. See the migration: a free-message
 * allowance is not transferable, and adding the trial's usage to the account's
 * would punish someone for trying the product twice.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  // The account they are signing in to.
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (user.is_anonymous) {
    // An anonymous user has nothing to claim INTO. If they registered, the
    // conversion kept their id and there was nothing to move in the first place.
    return json({ error: 'not_an_account' }, 400);
  }

  if (await isRateLimited('claim_trial', clientIp(request, clientAddress), 10, 60 * 60)) {
    return json({ error: 'rate_limited' }, 429);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const anonToken = typeof body?.anon_token === 'string' ? body.anon_token : null;
  if (!anonToken) return json({ error: 'invalid' }, 400);

  // Verify the trial session. An expired token fails here, which is the right
  // answer: we cannot prove the trial was theirs, so we do not move anything.
  const { data, error } = await supabaseAdmin.auth.getUser(anonToken);
  const trial = data?.user;
  if (error || !trial) return json({ error: 'trial_expired', moved: 0 }, 200);

  // It must actually be an anonymous user, and not the caller themselves.
  if (trial.is_anonymous !== true) return json({ error: 'not_a_trial' }, 400);
  if (trial.id === user.id) return json({ ok: true, moved: 0 });

  const [chats, saved] = await Promise.all([
    supabaseAdmin
      .from('chat_sessions')
      .update({ user_id: user.id })
      .eq('user_id', trial.id)
      .select('id'),
    supabaseAdmin
      .from('saved_sessions')
      .update({ user_id: user.id })
      .eq('user_id', trial.id)
      .select('id'),
  ]);

  if (chats.error || saved.error) {
    console.error('claim trial work failed', chats.error ?? saved.error);
    return json({ error: 'server_error' }, 500);
  }

  const moved = (chats.data?.length ?? 0) + (saved.data?.length ?? 0);
  console.log(`claimed ${moved} item(s) from trial ${trial.id} for ${user.id}`);
  return json({ ok: true, moved, conversations: chats.data?.length ?? 0 });
};
