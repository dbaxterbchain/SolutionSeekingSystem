import { serverEnv } from './env';

/**
 * Cloudflare API client for white-label custom domains. Two jobs:
 *  - Custom Hostnames (Cloudflare for SaaS): register a customer domain and get a cert.
 *    We use HTTP validation (`method: 'http'`) so the customer only ever adds ONE DNS
 *    record — the routing CNAME — and Cloudflare proves the cert itself.
 *  - Workers KV: the host -> {org, slug} map the router Worker reads. Provisioning
 *    writes it; teardown removes it. No per-domain Worker route (one wildcard covers all).
 *
 * Everything is server-only (the token is a secret). Calls fail soft (null/false + log).
 */

const API = 'https://api.cloudflare.com/client/v4';

const authHeaders = () => ({
  Authorization: `Bearer ${serverEnv('CLOUDFLARE_API_TOKEN')}`,
  'Content-Type': 'application/json',
});
const zoneId = () => serverEnv('CLOUDFLARE_ZONE_ID');
const accountId = () => serverEnv('CLOUDFLARE_ACCOUNT_ID');
const kvNamespace = () => serverEnv('CF_KV_NAMESPACE_ID');

/** The CNAME target customers point their domain at (the SaaS zone's fallback origin). */
export const saasTarget = (): string => serverEnv('CLOUDFLARE_SAAS_TARGET');

export interface CustomHostname {
  id: string;
  /** overall hostname status: pending | active | ... */
  status: string;
  /** cert status: pending_validation | pending_issuance | active | ... */
  sslStatus: string;
}

function shape(result: any): CustomHostname {
  return { id: result.id, status: result.status, sslStatus: result.ssl?.status ?? 'unknown' };
}

/** Register a custom hostname with HTTP DCV. Returns the record, or null on failure. */
export async function createCustomHostname(hostname: string): Promise<CustomHostname | null> {
  try {
    const res = await fetch(`${API}/zones/${zoneId()}/custom_hostnames`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } }),
    });
    const j = await res.json();
    if (!j.success) {
      console.error('cloudflare createCustomHostname failed', JSON.stringify(j.errors));
      return null;
    }
    return shape(j.result);
  } catch (e) {
    console.error('cloudflare createCustomHostname error', e);
    return null;
  }
}

/** Find an existing custom hostname by name (idempotency / status polling). */
export async function findCustomHostname(hostname: string): Promise<CustomHostname | null> {
  try {
    const res = await fetch(
      `${API}/zones/${zoneId()}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
      { headers: authHeaders() }
    );
    const j = await res.json();
    if (!j.success || !Array.isArray(j.result) || j.result.length === 0) return null;
    return shape(j.result[0]);
  } catch (e) {
    console.error('cloudflare findCustomHostname error', e);
    return null;
  }
}

export async function deleteCustomHostname(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/zones/${zoneId()}/custom_hostnames/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const j = await res.json();
    return Boolean(j.success);
  } catch (e) {
    console.error('cloudflare deleteCustomHostname error', e);
    return false;
  }
}

/** Write the host -> page mapping the router Worker reads. */
export async function kvPutHost(host: string, value: { org: string; slug: string }): Promise<boolean> {
  try {
    const res = await fetch(
      `${API}/accounts/${accountId()}/storage/kv/namespaces/${kvNamespace()}/values/${encodeURIComponent(host)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${serverEnv('CLOUDFLARE_API_TOKEN')}` }, body: JSON.stringify(value) }
    );
    const j = await res.json();
    return Boolean(j.success);
  } catch (e) {
    console.error('cloudflare kvPutHost error', e);
    return false;
  }
}

export async function kvDeleteHost(host: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API}/accounts/${accountId()}/storage/kv/namespaces/${kvNamespace()}/values/${encodeURIComponent(host)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${serverEnv('CLOUDFLARE_API_TOKEN')}` } }
    );
    const j = await res.json();
    return Boolean(j.success);
  } catch (e) {
    console.error('cloudflare kvDeleteHost error', e);
    return false;
  }
}
