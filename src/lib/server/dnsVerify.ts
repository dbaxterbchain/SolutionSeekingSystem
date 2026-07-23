/**
 * DNS-over-HTTPS check that a customer's custom domain points at our Cloudflare
 * for SaaS target. We use Google's public resolver so there's no DNS library and
 * no dependency, and it works from a Netlify Function. We only need a yes/no:
 * is there a CNAME from <host> to <target>?
 *
 * Best-effort by design: any network/parse error resolves to `ok: false` (not
 * verified yet) rather than throwing, so the wizard just keeps waiting on DNS.
 */

interface DohAnswer {
  name: string;
  /** DNS record type: 5 = CNAME, 1 = A, 28 = AAAA. */
  type: number;
  data: string;
}

/** Lowercase and drop the trailing dot DoH puts on fully-qualified names. */
const normalizeName = (n: string): string => n.trim().toLowerCase().replace(/\.$/, '');

/**
 * Resolve `host`'s CNAME via DoH and report whether it targets `target`.
 * `observed` is the CNAME we actually saw (for a helpful "points at X instead"
 * message), or null if the host has no CNAME yet.
 */
export async function cnamePointsTo(
  host: string,
  target: string
): Promise<{ ok: boolean; observed: string | null }> {
  const want = normalizeName(target);
  if (!want) return { ok: false, observed: null };
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=CNAME`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) return { ok: false, observed: null };
    const j = (await res.json()) as { Answer?: DohAnswer[] };
    const cnames = (Array.isArray(j.Answer) ? j.Answer : [])
      .filter((a) => a.type === 5)
      .map((a) => normalizeName(a.data));
    return { ok: cnames.includes(want), observed: cnames[0] ?? null };
  } catch (e) {
    console.error('dnsVerify cnamePointsTo error', e);
    return { ok: false, observed: null };
  }
}
