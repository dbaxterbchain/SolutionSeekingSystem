import { supabase } from './supabase';

/** The provisioning lifecycle a page's custom domain moves through. */
export type DomainStatus = 'none' | 'pending' | 'verifying' | 'active' | 'error';

export interface DomainState {
  status: DomainStatus;
  domain: string | null;
  /** The CNAME target the customer points their subdomain at. */
  cname_target: string | null;
  /** Present on verify/status: did the CNAME resolve to us yet? */
  dns_ok?: boolean;
  /** Present when DNS resolves to the wrong place, for a helpful message. */
  observed?: string | null;
  /** Cloudflare cert state while issuing (e.g. pending_validation, active). */
  ssl_status?: string | null;
  reason?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post(payload: Record<string, unknown>): Promise<DomainState> {
  const res = await fetch('/api/white-label-domain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? domainErrorMessage(data?.error));
  return data as DomainState;
}

export const setDomain = (orgId: string, pageId: string, domain: string): Promise<DomainState> =>
  post({ action: 'set_domain', org_id: orgId, page_id: pageId, domain });

export const verifyDomain = (orgId: string, pageId: string): Promise<DomainState> =>
  post({ action: 'verify', org_id: orgId, page_id: pageId });

export const domainStatus = (orgId: string, pageId: string): Promise<DomainState> =>
  post({ action: 'status', org_id: orgId, page_id: pageId });

export const removeDomain = (orgId: string, pageId: string): Promise<DomainState> =>
  post({ action: 'remove', org_id: orgId, page_id: pageId });

function domainErrorMessage(code?: string): string {
  switch (code) {
    case 'not_configured':
      return 'Custom domains are not available right now. Please try again later.';
    case 'domain_taken':
      return 'That domain is already connected to another page.';
    case 'domain_exists':
      return 'Remove the current domain before adding a new one.';
    case 'bad_domain':
      return 'Enter a subdomain you control, for example assistant.yourcompany.com.';
    case 'manager_required':
      return 'Only an organization manager can manage custom domains.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
