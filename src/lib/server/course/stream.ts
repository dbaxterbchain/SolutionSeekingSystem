import { supabaseAdmin } from '../supabaseAdmin';
import { serverEnv } from '../env';
import { resolvePlayback, type Playback, type TokenStore } from '../../course/streamPlayback';
import { COURSE } from '../../../data/course';

/** The shared-token store on course_stream_tokens (service role only). */
const store: TokenStore = {
  async get(uid) {
    const { data, error } = await supabaseAdmin
      .from('course_stream_tokens')
      .select('token, expires_at')
      .eq('stream_uid', uid)
      .maybeSingle();
    if (error) throw new Error(`course_stream_tokens read failed: ${error.message}`);
    return data ?? null;
  },
  async put(uid, token, expiresAt) {
    const { error } = await supabaseAdmin.from('course_stream_tokens').upsert({
      stream_uid: uid,
      token,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw new Error(`course_stream_tokens write failed: ${error.message}`);
  },
};

const memo = new Map<string, { token: string; expiresAt: Date }>();

/** Playback for one Stream video, or null when it cannot be prepared. Never throws. */
export function getPlayback(uid: string): Promise<Playback | null> {
  return resolvePlayback(
    {
      fetch,
      store,
      now: () => new Date(),
      customerCode: serverEnv('CLOUDFLARE_STREAM_CUSTOMER_CODE') || COURSE.streamCustomerCode,
      accountId: serverEnv('CLOUDFLARE_ACCOUNT_ID'),
      apiToken: serverEnv('CLOUDFLARE_STREAM_API_TOKEN'),
      memo,
    },
    uid
  );
}

export type { Playback };
