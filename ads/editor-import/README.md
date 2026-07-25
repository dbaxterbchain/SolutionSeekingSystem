# Ads Editor import files

> **Historical artifact (2026-07):** the campaigns were built via the API and are now managed
> by the global `adkit` CLI (private repo dbaxterbchain/adkit, client `sss`). These CSVs are
> the zero-credential fallback only.

The corrected two-campaign build from [docs/ads-campaign.md](../../docs/ads-campaign.md) as
Google Ads Editor CSVs, so the campaigns can be rebuilt cleanly without API credentials.
Both campaigns import **Paused**; enable them only after the post-import checklist below.

## Import steps

1. Install / open **Google Ads Editor**, sign in, download the account (More data during setup
   is fine).
2. **Account > Import > From file...** and pick `consumer-campaign.csv`. Ads Editor shows a
   column-mapping preview; the headers here use its standard names, so the mapping should be
   automatic. Confirm, review the proposed changes (green plus rows), and accept.
3. Repeat for `b2b-campaign.csv`.
4. Repeat for `negative-keywords.csv` (these are **campaign-level negative keywords**; if the
   import preview asks for the data type, choose campaign negative keywords).
5. **Post** the changes (Keep/Post proposed changes), then walk the checklist below in the web
   UI, because CSVs cannot carry every campaign setting.
6. **Pause the OLD partial SSS campaign** (the one with the hand-built ad groups) once the two
   new ones are enabled, so they do not compete for the same keywords. Do not delete it yet;
   its history is useful for comparison.
7. **Leave the Beanchain shop campaigns alone.** They share this account; nothing in these
   files touches them, and the API toolkit refuses to modify campaigns not named `SSS ...` by
   design.

## Post-import checklist (web UI, per campaign)

- [ ] Networks: **Search partners OFF, Display OFF** (re-check after saving)
- [ ] Location: United States; Location options = **Presence**, not "presence or interest"
- [ ] Bidding: **Maximize Clicks with a max CPC cap** — $10 (SSS Consumer) / $14 (SSS Business)
- [ ] Ad rotation: Do not optimize
- [ ] Campaign URL options > **Final URL suffix**:
      `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}`
- [ ] **Auto-apply recommendations OFF** (account level; Google re-enables it)
- [ ] Sitelinks + callouts from the build sheet (section 4)
- [ ] Then set both campaigns from Paused to **Enabled**
- [ ] Ad Preview & Diagnosis shows an ad serving for one keyword per campaign

## Regenerating

These files are hand-maintained alongside the build sheet today; once the `ads/` API toolkit is
live, `ads/campaigns.json` becomes the single source of truth and drift is reconciled through
the API instead of re-imports.
