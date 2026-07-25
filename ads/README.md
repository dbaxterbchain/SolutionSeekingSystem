# Google Ads toolkit

Direct API access to the Ads account: analysis via GAQL, campaign management via small,
reviewable scripts on the official `google-ads` Python library (managed by `uv`; no global
Python needed). One-time credential setup: [docs/ads-api-setup.md](../docs/ads-api-setup.md).
Campaign structure source of truth: [campaigns.json](campaigns.json), which mirrors
[docs/ads-campaign.md](../docs/ads-campaign.md).

## Safety contract

- **Dry run by default.** Every write command prints what it would do; `--apply` executes.
- **Everything created starts PAUSED.** Enabling is always an explicit human-approved step.
- **Scope guard.** Write commands refuse campaigns not named `SSS ...` — the Beanchain shop
  campaigns share this account and are off limits to tooling. Reads are account-wide.
- Budgets and bids change only through explicit `manage.py` invocations, never automatically.

## Commands (run from `ads/`)

```bash
uv run report.py --preset accounts        # sanity: token + OAuth + login id work
uv run report.py --preset campaigns       # structure: budgets, caps, suffix, status
uv run report.py --preset perf --days 7   # impressions/clicks/cost/impression share
uv run report.py --preset keywords        # keyword status + first-page bid estimates
uv run report.py --preset search-terms    # what people actually typed (negatives mine)
uv run report.py --gaql "SELECT ..."      # raw GAQL escape hatch

uv run build.py                           # reconcile vs campaigns.json (dry run)
uv run build.py --apply                   # create missing entities, paused

uv run manage.py pause|enable --campaign "SSS Consumer" --apply
uv run manage.py set-budget --campaign "SSS Consumer" --amount 15 --apply
uv run manage.py set-cpc-cap --campaign "SSS Consumer" --cap 10 --apply
uv run manage.py add-negative --campaign "SSS Consumer" --keyword "..." --apply
uv run manage.py remove-negative --campaign "SSS Consumer" --keyword "..." --apply
```

## Also in this folder

- `editor-import/`: Google Ads Editor CSVs for building the campaigns with zero API
  credentials (the bridge used before the API was wired). See its README for the import steps
  and the post-import checklist.
- `generate_refresh_token.py`: one-time OAuth helper (runbook step 7).

## Analysis via MCP

`.mcp.json` at the repo root attaches Google's official read-only Google Ads MCP server, so
Claude Code can run GAQL directly in any session. Same credentials, read-only by design.
