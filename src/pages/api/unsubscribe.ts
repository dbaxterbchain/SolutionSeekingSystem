import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';

export const prerender = false;

/**
 * One-click unsubscribe from the footer of every email. Legally required, and
 * more practically: an easy unsubscribe is what keeps a list out of spam folders.
 *
 * Returns a small HTML page rather than JSON, because a person clicked this.
 */
const page = (title: string, message: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title} | Solution Seeking System</title>
    <style>
      body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
             background:#f8fafc; color:#334155; line-height:1.6;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; }
      .card { max-width:30rem; margin:1.5rem; padding:2rem; background:#fff; border-radius:1rem; text-align:center; }
      h1 { margin:0 0 .5rem; font-size:1.35rem; color:#16276B; }
      p { margin:0 0 1.25rem; font-size:.95rem; }
      a { display:inline-block; background:#5271FF; color:#fff; text-decoration:none;
          font-weight:600; padding:.7rem 1.3rem; border-radius:999px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${message}</p>
      <a href="/">Back to the site</a>
    </div>
  </body>
</html>`;

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

export const GET: APIRoute = async ({ request }) => {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) {
    return html(
      page('That link looks incomplete', 'Please use the unsubscribe link from the email itself.'),
      400
    );
  }

  const { error } = await supabaseAdmin
    .from('email_subscribers')
    .update({ status: 'unsubscribed' })
    .eq('token', token);

  if (error) {
    console.error('unsubscribe failed', error);
    return html(
      page(
        'Something went wrong',
        'We could not process that just now. Please try again, and if it keeps failing, reply to any of our emails and we will remove you by hand.'
      ),
      500
    );
  }

  return html(
    page(
      'You are unsubscribed',
      'You will not get any more email from us. The whole system stays free to read on the site, no account needed.'
    )
  );
};

/**
 * Some mail clients (and Gmail's List-Unsubscribe) POST instead of following the
 * link. Accept both, or those requests silently fail and people keep getting mail
 * they asked to stop.
 */
export const POST: APIRoute = GET;
