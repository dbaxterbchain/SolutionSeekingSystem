import { serverEnv } from './env';

/**
 * Approved testimonials, read at BUILD time.
 *
 * Build time rather than in the browser, for two reasons. The `testimonials`
 * table is unreadable from a browser by design (migration 0010), and a quote
 * fetched after page load is invisible to Google and to the AI assistants that
 * increasingly answer "how do I talk to my employee about X", which is most of
 * the point of putting proof on a landing page.
 *
 * NOTE THE INVERTED FAILURE POLICY. Its sibling, src/lib/demoExcerpt.ts, THROWS
 * at build time, because a demo excerpt that has drifted from its transcript is
 * a lie and must never reach a reader. This one must NEVER throw: if the
 * database is unreachable, the honest outcome is a page with no testimonials on
 * it, not a failed deploy. A missing quote is a smaller harm than a missing
 * website.
 */

export interface Testimonial {
  id: string;
  quote: string;
  display_name: string | null;
  role_title: string | null;
  agent: 'guide' | 'mentor';
}

let cache: Promise<Testimonial[]> | null = null;

/** Memoised: two pages call this, and it is the same answer for one build. */
export function getApprovedTestimonials(limit = 6): Promise<Testimonial[]> {
  return (cache ??= load(limit));
}

async function load(limit: number): Promise<Testimonial[]> {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = serverEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    // Not necessarily an error: `npm run build` locally runs with placeholder
    // vars and no service key, and must still succeed. But on a real deploy this
    // means the section silently vanished, so say so where a deploy log will
    // show it, and say exactly what to check.
    console.error(
      '[testimonials] No SUPABASE_SERVICE_ROLE_KEY in the BUILD environment, so the ' +
        'testimonials section is omitted from this build. If this is a deploy and not a ' +
        'local build, check that the variable is scoped to Builds in Netlify and not only ' +
        'to Functions.'
    );
    return [];
  }

  try {
    // Imported dynamically, and this is load-bearing. supabaseAdmin.ts calls
    // createClient() at module scope, and supabase-js throws "supabaseKey is
    // required." on an empty key. A static import would therefore crash the
    // whole build from this page's frontmatter whenever the key is absent,
    // including every local build. Import it only once the key is known to exist.
    const { supabaseAdmin } = await import('./supabaseAdmin');

    const { data, error } = await supabaseAdmin
      .from('testimonials')
      // status='approved' already implies consent and a non-blank quote: the
      // table's check constraint refuses to approve a row without both.
      .select('id, quote, display_name, role_title, agent')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[testimonials] query failed; omitting the section', error);
      return [];
    }

    return (data ?? []).filter((r) => (r.quote ?? '').trim() !== '') as Testimonial[];
  } catch (err) {
    console.error('[testimonials] unreachable; omitting the section', err);
    return [];
  }
}
