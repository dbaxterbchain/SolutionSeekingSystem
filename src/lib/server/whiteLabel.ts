import { supabaseAdmin } from './supabaseAdmin';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidSlug = (slug: string): boolean => SLUG_RE.test(slug);
export const isUuid = (v: string): boolean => UUID_RE.test(v);

export type WlAgent = 'guide' | 'mentor';

export interface WhiteLabelPage {
  id: string;
  org_id: string;
  slug: string;
  assistant_id: string | null;
  agent: WlAgent | null;
  context: string | null;
  title: string;
  description: string;
  display_instructions: string;
  logo_path: string | null;
  status: string;
  custom_domain: string | null;
}

/** The canonical URL path for a page. */
export const pagePath = (page: { org_id: string; slug: string }): string =>
  `/a/${page.org_id}/${page.slug}`;

/** Public URL for a logo object in the (public) branding bucket, or null. */
export function logoUrl(logoPath: string | null): string | null {
  if (!logoPath) return null;
  const { data } = supabaseAdmin.storage.from('branding').getPublicUrl(logoPath);
  return data.publicUrl;
}

/**
 * Load an ACTIVE white-label page by (org id, slug), or null. The org id shape is
 * validated before querying, so a garbage path is a fast 404 rather than a DB
 * error. Service role: this table is never client-readable.
 */
export async function getActivePage(orgId: string, slug: string): Promise<WhiteLabelPage | null> {
  if (!isUuid(orgId) || !isValidSlug(slug)) return null;
  const { data, error } = await supabaseAdmin
    .from('white_label_pages')
    .select(
      'id, org_id, slug, assistant_id, agent, context, title, description, display_instructions, logo_path, status, custom_domain'
    )
    .eq('org_id', orgId)
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    console.error('white-label page lookup failed', error);
    return null;
  }
  return (data as WhiteLabelPage) ?? null;
}

/** The display name of a page's specialized assistant, if any. */
export async function pageAssistantName(assistantId: string | null): Promise<string | null> {
  if (!assistantId) return null;
  const { data } = await supabaseAdmin
    .from('assistants')
    .select('name')
    .eq('id', assistantId)
    .maybeSingle();
  return data?.name ?? null;
}
