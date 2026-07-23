# White-label custom domains: self-serve wizard

A manager connects their own domain to a white-label page from the dashboard, with
no operator involvement. The wizard (in `WhiteLabelPanel.tsx`, backed by
`/api/white-label-domain`) provisions a Cloudflare for SaaS custom hostname (HTTP DCV,
so the customer adds a single CNAME), writes the host to KV so the router Worker serves
only that assistant, and polls the certificate to "live".

Lifecycle: `none -> pending -> verifying -> active` (with `error` if provisioning fails),
stored on `white_label_pages.domain_status`. Every step is idempotent and manager-gated.

These were captured end to end in a real browser against the local app, with the
provisioning calls hitting the live Cloudflare account (validated with the real API
token, then torn down).

## Screenshots

1. **1-connect-domain.png** — The starting state: enter the subdomain you want (e.g.
   `assistant.yourcompany.com`). The `/a/<org>/<slug>` link keeps working throughout.
2. **2-add-cname-record.png** — After connecting, the wizard shows the exact CNAME
   record to add (one record, copyable value = the Cloudflare for SaaS target).
3. **3-verify-dns-pending.png** — "Verify DNS" checks the CNAME over DNS-over-HTTPS.
   Until it resolves to us, the wizard stays on `pending` with a "not detected yet" hint
   (and, when the record points somewhere else, says where).
4. **4-certificate-issuing.png** — DNS verified: the custom hostname is created and the
   certificate is issuing. The wizard polls every few seconds until it goes live.
5. **5-live-on-domain.png** — Live. The page is served on the customer's domain over
   HTTPS, walled to just this assistant, and the row shows a "Live domain" link.
