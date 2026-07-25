"""Read-only Google Ads reporting via GAQL.

Usage:
    uv run report.py --preset accounts
    uv run report.py --preset campaigns
    uv run report.py --preset perf [--days 30]
    uv run report.py --preset keywords [--campaign "SSS Consumer"]
    uv run report.py --preset search-terms [--days 30]
    uv run report.py --preset ads
    uv run report.py --gaql "SELECT campaign.name FROM campaign"

Reads are account-wide on purpose (the Beanchain shop campaigns share this
account and analyzing them is fine); only the WRITE tools are scoped to SSS.
"""

from __future__ import annotations

import argparse

from _common import make_client, default_customer_id, from_micros


def preset_query(name: str, days: int, campaign: str | None) -> str:
    date = f"segments.date DURING LAST_{days}_DAYS" if days in (7, 14, 30) else "segments.date DURING LAST_30_DAYS"
    camp_filter = f" AND campaign.name = '{campaign}'" if campaign else ""
    queries = {
        "campaigns": """
            SELECT campaign.id, campaign.name, campaign.status,
                   campaign.bidding_strategy_type, campaign_budget.amount_micros,
                   campaign.target_spend.cpc_bid_ceiling_micros,
                   campaign.final_url_suffix
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            ORDER BY campaign.name""",
        "perf": f"""
            SELECT campaign.name, metrics.impressions, metrics.clicks,
                   metrics.average_cpc, metrics.cost_micros, metrics.ctr,
                   metrics.search_impression_share
            FROM campaign
            WHERE campaign.status != 'REMOVED' AND {date}
            ORDER BY metrics.impressions DESC""",
        "keywords": f"""
            SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text,
                   ad_group_criterion.keyword.match_type, ad_group_criterion.status,
                   ad_group_criterion.system_serving_status,
                   ad_group_criterion.position_estimates.first_page_cpc_micros,
                   metrics.impressions, metrics.clicks
            FROM keyword_view
            WHERE ad_group_criterion.status != 'REMOVED' AND {date}{camp_filter}
            ORDER BY campaign.name, ad_group.name""",
        "search-terms": f"""
            SELECT campaign.name, search_term_view.search_term,
                   segments.keyword.info.text, metrics.impressions, metrics.clicks,
                   metrics.cost_micros
            FROM search_term_view
            WHERE {date}{camp_filter}
            ORDER BY metrics.impressions DESC""",
        "ads": """
            SELECT campaign.name, ad_group.name, ad_group_ad.status,
                   ad_group_ad.policy_summary.approval_status,
                   ad_group_ad.ad.responsive_search_ad.headlines
            FROM ad_group_ad
            WHERE ad_group_ad.status != 'REMOVED'
            ORDER BY campaign.name""",
    }
    return queries[name]


MICRO_FIELDS = {"amount_micros", "cost_micros", "average_cpc", "cpc_bid_ceiling_micros", "first_page_cpc_micros"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset", choices=["accounts", "campaigns", "perf", "keywords", "search-terms", "ads"])
    parser.add_argument("--gaql", help="Raw GAQL query (overrides --preset)")
    parser.add_argument("--days", type=int, default=30, choices=[7, 14, 30])
    parser.add_argument("--campaign", help="Filter presets to one campaign name")
    parser.add_argument("--customer", help="Customer id override (digits only)")
    args = parser.parse_args()

    client = make_client()

    if args.preset == "accounts":
        svc = client.get_service("CustomerService")
        for name in svc.list_accessible_customers().resource_names:
            print(name)
        return

    if not args.gaql and not args.preset:
        parser.error("Provide --preset or --gaql")

    customer_id = (args.customer or default_customer_id()).replace("-", "")
    query = args.gaql or preset_query(args.preset, args.days, args.campaign)
    ga = client.get_service("GoogleAdsService")

    count = 0
    for batch in ga.search_stream(customer_id=customer_id, query=query):
        for row in batch.results:
            parts = []
            for field in batch.field_mask.paths:
                obj = row
                for attr in field.split("."):
                    obj = getattr(obj, attr, "")
                leaf = field.rsplit(".", 1)[-1]
                if leaf in MICRO_FIELDS and str(obj).isdigit():
                    obj = from_micros(int(obj))
                parts.append(f"{field.rsplit('.', 1)[-1]}={obj}")
            print(" | ".join(str(p) for p in parts))
            count += 1
    print(f"\n{count} rows")


if __name__ == "__main__":
    main()
