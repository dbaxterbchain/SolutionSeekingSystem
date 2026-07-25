# Google Ads API access: one-time setup runbook

Gives Claude Code (and any future tooling) direct API access to the Ads account: analysis via
the official read-only MCP server, and campaign writes via the `ads/` toolkit. Everything here
is one-time. Nothing in this runbook enters git; credentials live in `~/.google-ads.yaml` and
`.env` (both untracked).

The chain: **Manager account (MCC) → developer token → link the ad account → Google Cloud
project → OAuth consent screen → Desktop OAuth client → refresh token → config files.**

## 1. Create a Manager account (MCC)

Developer tokens are only issued from manager accounts, even for a solo advertiser.

- Go to https://ads.google.com/home/tools/manager-accounts/ and create one with the SAME
  Google account that owns the ad account (the token and OAuth consent are tied to it).
- Name it anything ("Beanchain Manager"). It manages accounts, it never runs ads itself.

## 2. Developer token (API Center)

- In the NEW manager account: **Admin (wrench) > API Center** (or ads.google.com/aw/apicenter
  while signed into the manager account).
- Accept the API terms, fill the contact details, and copy the **22-character developer token**.
- Note the **access level** shown next to it:
  - **Test accounts** only at first is normal.
  - Google often auto-upgrades new tokens to **Explorer** (production reads AND campaign
    management, 2,880 operations/day, no application). Check back after the rest of the setup.
  - If it stays Test-only: **Apply for Basic access** from the same page (2-5 business days;
    optionally complete brand verification on the Cloud project to be reviewed within hours).

## 3. Link the ad account under the MCC

- Manager account > **Accounts > Sub-account settings > Link existing account**: enter the ad
  account's customer ID (the 3-3-4 digit number, top right of the normal Ads UI).
- Accept the invitation inside the regular ad account (notification bell or Access settings).
- Record both IDs (digits only, no dashes):
  - `login_customer_id` = the MANAGER account's ID
  - `customer_id` = the AD account's ID

## 4. Google Cloud project + enable the API

- https://console.cloud.google.com > New project (e.g. `sss-ads-api`).
- **APIs & Services > Library >** search "Google Ads API" > **Enable**.

## 5. OAuth consent screen

- **APIs & Services > OAuth consent screen** (Google Auth Platform).
- User type: **External** (Internal is only for Workspace orgs). App name/support email: anything.
- Add your own Google account under **Test users**.
- **CRITICAL:** after creating it, set Publishing status to **In production** (Publish app).
  A consent screen left in "Testing" issues refresh tokens that EXPIRE AFTER 7 DAYS, which
  looks like everything working and then silently breaking a week later. Publishing does not
  require Google verification for personal use; the unverified-app warning during consent is
  fine to click through (Advanced > continue).

## 6. OAuth client (Desktop app)

- **APIs & Services > Credentials > Create credentials > OAuth client ID > Desktop app.**
- Download / copy the **client ID** and **client secret**.

## 7. Refresh token

From the repo root (uv fetches the official helper and its deps on the fly):

```bash
uv run --with google-ads python ads/generate_refresh_token.py --client_id <ID> --client_secret <SECRET>
```

- A browser opens: sign in with the SAME Google account, click through the unverified-app
  warning, approve the `adwords` scope. The script prints the **refresh token**.

## 8. Config files

**`~/.google-ads.yaml`** (in the HOME directory, never the repo):

```yaml
developer_token: XXXXXXXXXXXXXXXXXXXXXX
client_id: XXXXXXXX.apps.googleusercontent.com
client_secret: XXXXXXXX
refresh_token: 1//XXXXXXXX
login_customer_id: 1234567890   # the MCC id, digits only
use_proto_plus: true
```

**`.env`** (repo root, gitignored) — the same five values with the `GOOGLE_ADS_` prefix, plus
the ad account id, for the MCP server and the toolkit:

```
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_REFRESH_TOKEN=...
GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890
GOOGLE_ADS_CUSTOMER_ID=0987654321
```

## 9. Smoke test

```bash
cd ads && uv run report.py --preset accounts
```

Should list the MCC and the ad account. Then `uv run report.py --preset campaigns` returns the
campaigns. If it errors:

| Error | Cause |
|---|---|
| `DEVELOPER_TOKEN_NOT_APPROVED` / test-accounts-only | Token still at Test level: wait for Explorer auto-upgrade or apply for Basic (step 2) |
| `USER_PERMISSION_DENIED` | `login_customer_id` missing/wrong (must be the MCC id), or the account link (step 3) not accepted |
| `invalid_grant` | Refresh token minted while consent screen was in Testing and it expired, or wrong Google account: redo steps 5 and 7 |

## Ongoing use

- **Analysis**: the `google-ads` MCP server in `.mcp.json` gives Claude GAQL directly.
- **Writes**: `ads/manage.py` / `ads/build.py`; dry-run by default, `--apply` to execute,
  created entities start paused. See [ads/README.md](../ads/README.md).
- Quota at Explorer level is 2,880 operations/day, far beyond this account's needs. Apply for
  Basic only if Keyword Planner data via API becomes interesting.
