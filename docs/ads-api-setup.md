# Google Ads API setup: moved to adkit

The Google Ads tooling was extracted into its own multi-client toolkit, **adkit**
(private repo: https://github.com/dbaxterbchain/adkit), on 2026-07-25. This site is now
just one of its clients (`--client sss`).

- Credential runbook (MCC, developer token, OAuth, refresh token): `adkit/docs/setup.md`
- Session operating contract: `adkit/CLAUDE.md`
- SSS campaign spec: `adkit/clients/sss/campaigns.json`
- Everyday use: `adkit report --client sss --preset perf`, `adkit digest --client sss`

Credentials live in `~/.google-ads.yaml` only; nothing ads-related remains in this repo's
`.env`. The `.mcp.json` here still attaches the read-only google-ads MCP server for
analysis inside SSS sessions.
