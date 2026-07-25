"""Declarative campaign builder: reconcile the account against campaigns.json.

- Creates whatever is missing (campaigns, ad groups, keywords, RSAs, negatives).
- Everything created starts PAUSED. Enabling is always a human decision
  (manage.py enable, or the web UI after the launch checklist).
- Reports drift on what already exists (budget, CPC ceiling, URL suffix,
  status, and per-ad-group entity counts). It does NOT auto-correct drift;
  fix drift with manage.py so each change is explicit.
- Scope guard: only touches campaigns named in campaigns.json (all "SSS ...").
  The Beanchain shop campaigns share this account and are never modified.
- DRY-RUN BY DEFAULT: add --apply to execute.

Usage:
    uv run build.py            # dry run: what would be created + drift report
    uv run build.py --apply    # create missing entities (paused)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from _common import make_client, default_customer_id, micros, from_micros

US_GEO = "geoTargetConstants/2840"
LANG_EN = "languageConstants/1000"


def gaql(client, customer_id, query):
    ga = client.get_service("GoogleAdsService")
    return [r for batch in ga.search_stream(customer_id=customer_id, query=query) for r in batch.results]


def existing_campaign(client, customer_id, name):
    rows = gaql(
        client, customer_id,
        "SELECT campaign.id, campaign.name, campaign.status, campaign.final_url_suffix, "
        "campaign.target_spend.cpc_bid_ceiling_micros, campaign.campaign_budget, "
        "campaign_budget.amount_micros "
        f"FROM campaign WHERE campaign.name = '{name}' AND campaign.status != 'REMOVED'",
    )
    return rows[0] if rows else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Execute (default is dry run)")
    parser.add_argument("--customer", help="Customer id override")
    args = parser.parse_args()

    spec = json.loads((Path(__file__).parent / "campaigns.json").read_text(encoding="utf-8"))
    client = make_client()
    customer_id = (args.customer or default_customer_id()).replace("-", "")
    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"== build.py {mode} against customer {customer_id} ==\n")

    for camp_spec in spec["campaigns"]:
        name = camp_spec["name"]
        if not name.startswith("SSS"):
            sys.exit(f"Scope guard: campaigns.json contains non-SSS campaign '{name}'; refusing.")
        row = existing_campaign(client, customer_id, name)
        if row:
            drift_report(camp_spec, spec, row, client, customer_id)
        else:
            create_campaign(camp_spec, spec, client, customer_id, args.apply)
        print()

    if not args.apply:
        print("Dry run complete. Add --apply to create the missing entities (paused).")


def drift_report(camp_spec, spec, row, client, customer_id):
    name = camp_spec["name"]
    print(f"EXISTS: {name} (status {row.campaign.status.name})")
    checks = [
        ("daily budget", from_micros(row.campaign_budget.amount_micros), f"${camp_spec['daily_budget']:,.2f}"),
        ("cpc ceiling", from_micros(row.campaign.target_spend.cpc_bid_ceiling_micros), f"${camp_spec['cpc_ceiling']:,.2f}"),
        ("url suffix", row.campaign.final_url_suffix or "(none)", spec["url_suffix"]),
    ]
    for label, actual, wanted in checks:
        flag = "ok" if str(actual) == str(wanted) else "DRIFT"
        print(f"  {flag}: {label}: {actual}" + ("" if flag == "ok" else f" (want {wanted})"))

    groups = gaql(
        client, customer_id,
        f"SELECT ad_group.id, ad_group.name FROM ad_group WHERE campaign.id = {row.campaign.id} AND ad_group.status != 'REMOVED'",
    )
    have = {g.ad_group.name for g in groups}
    want = {g["name"] for g in camp_spec["ad_groups"]}
    for missing in sorted(want - have):
        print(f"  MISSING ad group: {missing} (run with a fresh campaign, or add via the UI/Editor)")
    for extra in sorted(have - want):
        print(f"  extra ad group (left alone): {extra}")
    negs = gaql(
        client, customer_id,
        f"SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id = {row.campaign.id} AND campaign_criterion.negative = TRUE",
    )
    have_negs = {n.campaign_criterion.keyword.text for n in negs}
    missing_negs = [n for n in camp_spec["negatives"] if n not in have_negs]
    if missing_negs:
        print(f"  MISSING negatives ({len(missing_negs)}): {', '.join(missing_negs)}")
        print("    fix: uv run manage.py add-negative --campaign \"" + name + "\" --keyword \"...\" --apply")


def create_campaign(camp_spec, spec, client, customer_id, apply):
    name = camp_spec["name"]
    n_kw = sum(len(g["keywords"]) for g in camp_spec["ad_groups"])
    print(
        f"CREATE: {name} (PAUSED): budget ${camp_spec['daily_budget']}/day, "
        f"Maximize Clicks capped ${camp_spec['cpc_ceiling']}, {len(camp_spec['ad_groups'])} ad groups, "
        f"{n_kw} keywords x2 match types, RSAs, {len(camp_spec['negatives'])} negatives, US presence, English"
    )
    if not apply:
        return

    # 1. Budget
    budget_svc = client.get_service("CampaignBudgetService")
    b_op = client.get_type("CampaignBudgetOperation")
    b_op.create.name = f"{name} budget"
    b_op.create.amount_micros = micros(camp_spec["daily_budget"])
    b_op.create.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    b_op.create.explicitly_shared = False
    budget_res = budget_svc.mutate_campaign_budgets(customer_id=customer_id, operations=[b_op]).results[0].resource_name

    # 2. Campaign: Search only, both partner networks OFF, paused, capped Maximize Clicks
    camp_svc = client.get_service("CampaignService")
    c_op = client.get_type("CampaignOperation")
    c = c_op.create
    c.name = name
    c.status = client.enums.CampaignStatusEnum.PAUSED
    c.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH
    c.campaign_budget = budget_res
    c.network_settings.target_google_search = True
    c.network_settings.target_search_network = False
    c.network_settings.target_content_network = False
    c.network_settings.target_partner_search_network = False
    c.target_spend.cpc_bid_ceiling_micros = micros(camp_spec["cpc_ceiling"])
    c.final_url_suffix = spec["url_suffix"]
    c.geo_target_type_setting.positive_geo_target_type = (
        client.enums.PositiveGeoTargetTypeEnum.PRESENCE
    )
    campaign_res = camp_svc.mutate_campaigns(customer_id=customer_id, operations=[c_op]).results[0].resource_name
    print(f"  created {campaign_res}")

    # 3. Geo (US) + language (English)
    crit_svc = client.get_service("CampaignCriterionService")
    ops = []
    geo_op = client.get_type("CampaignCriterionOperation")
    geo_op.create.campaign = campaign_res
    geo_op.create.location.geo_target_constant = US_GEO
    ops.append(geo_op)
    lang_op = client.get_type("CampaignCriterionOperation")
    lang_op.create.campaign = campaign_res
    lang_op.create.language.language_constant = LANG_EN
    ops.append(lang_op)
    # 4. Negatives
    for neg in camp_spec["negatives"]:
        n_op = client.get_type("CampaignCriterionOperation")
        n_op.create.campaign = campaign_res
        n_op.create.negative = True
        n_op.create.keyword.text = neg
        n_op.create.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
        ops.append(n_op)
    crit_svc.mutate_campaign_criteria(customer_id=customer_id, operations=ops)
    print(f"  geo/language/negatives set ({len(ops)} criteria)")

    # 5. Ad groups + keywords + RSAs
    ag_svc = client.get_service("AdGroupService")
    agc_svc = client.get_service("AdGroupCriterionService")
    ad_svc = client.get_service("AdGroupAdService")
    shared = camp_spec.get("shared_rsa")
    for group in camp_spec["ad_groups"]:
        ag_op = client.get_type("AdGroupOperation")
        ag_op.create.name = group["name"]
        ag_op.create.campaign = campaign_res
        ag_op.create.status = client.enums.AdGroupStatusEnum.ENABLED
        ag_op.create.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
        ag_res = ag_svc.mutate_ad_groups(customer_id=customer_id, operations=[ag_op]).results[0].resource_name

        kw_ops = []
        for kw in group["keywords"]:
            for match in ("PHRASE", "BROAD"):
                k_op = client.get_type("AdGroupCriterionOperation")
                k_op.create.ad_group = ag_res
                k_op.create.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
                k_op.create.keyword.text = kw
                k_op.create.keyword.match_type = getattr(client.enums.KeywordMatchTypeEnum, match)
                kw_ops.append(k_op)
        agc_svc.mutate_ad_group_criteria(customer_id=customer_id, operations=kw_ops)

        rsa = {
            "final_url": group.get("final_url", (shared or {}).get("final_url")),
            "path1": group.get("path1", (shared or {}).get("path1")),
            "path2": group.get("path2", (shared or {}).get("path2")),
            "headlines": group.get("headlines", (shared or {}).get("headlines")),
            "descriptions": group.get("descriptions", (shared or {}).get("descriptions")),
        }
        ad_op = client.get_type("AdGroupAdOperation")
        ad_op.create.ad_group = ag_res
        ad_op.create.status = client.enums.AdGroupAdStatusEnum.ENABLED
        ad = ad_op.create.ad
        ad.final_urls.append(rsa["final_url"])
        for h in rsa["headlines"]:
            asset = client.get_type("AdTextAsset")
            asset.text = h
            ad.responsive_search_ad.headlines.append(asset)
        for d in rsa["descriptions"]:
            asset = client.get_type("AdTextAsset")
            asset.text = d
            ad.responsive_search_ad.descriptions.append(asset)
        ad.responsive_search_ad.path1 = rsa["path1"]
        ad.responsive_search_ad.path2 = rsa["path2"]
        ad_svc.mutate_ad_group_ads(customer_id=customer_id, operations=[ad_op])
        print(f"  ad group '{group['name']}': {len(kw_ops)} keywords + RSA")

    print(f"  DONE. '{name}' is PAUSED; walk the launch checklist, then: uv run manage.py enable --campaign \"{name}\" --apply")


if __name__ == "__main__":
    main()
