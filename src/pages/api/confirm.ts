import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';

export const prerender = false;

const GUIDE_PDF = '/solution-seeking-complete-guide.pdf';

/**
 * The confirmation link from the delivery email, which is also the download
 * button. Clicking it proves the address is real and hands over the guide in one
 * action, so double opt-in costs the reader nothing.
 *
 * A bad or missing token still gets the PDF: the guide is free, and refusing to
 * serve it over a mangled link would punish the reader for our problem. We just
 * don't mark anything confirmed.
 */
export const GET: APIRoute = async ({ request, redirect }) => {
  const token = new URL(request.url).searchParams.get('token');

  if (token) {
    const { error } = await supabaseAdmin
      .from('email_subscribers')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('token', token)
      // Don't resurrect someone who has since unsubscribed.
      .eq('status', 'pending');
    if (error) console.error('confirm failed', error);
  }

  return redirect(GUIDE_PDF, 302);
};
