"""Targeted Google Ads mutations, scoped to SSS campaigns.

Safety contract:
- DRY-RUN BY DEFAULT: prints exactly what would change. Add --apply to execute.
- SCOPE GUARD: refuses to touch any campaign whose name does not start with
  "SSS" (the Beanchain shop campaigns share this account). Override requires
  --allow-any-campaign, which should essentially never be used.

Usage:
    uv run manage.py pause --campaign "SSS Consumer" [--apply]
    uv run manage.py enable --campaign "SSS Consumer" [--apply]
    uv run manage.py set-budget --campaign "SSS Consumer" --amount 15.00 [--apply]
    uv run manage.py set-cpc-cap --campaign "SSS Consumer" --cap 10.00 [--apply]
    uv run manage.py add-negative --campaign "SSS Consumer" --keyword "free template" [--match BROAD] [--apply]
    uv run manage.py remove-negative --campaign "SSS Consumer" --keyword "free template" [--apply]
"""

from __future__ import annotations

import argparse
import sys

from _common import make_client, default_customer_id, micros

SCOPE_PREFIXES = ("SSS", "Solution Seeking")


def find_campaign(client, customer_id: str, name: str, allow_any: bool):
    if not name.startswith(SCOPE_PREFIXES) and not allow_any:
        sys.exit(
            f"Scope guard: '{name}' does not start with one of {SCOPE_PREFIXES}. The Beanchain "
            "shop campaigns share this account and are off limits. (--allow-any-campaign overrides.)"
        )
    ga = client.get_service("GoogleAdsService")
    query = (
        "SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget, "
        "campaign.target_spend.cpc_bid_ceiling_micros "
        f"FROM campaign WHERE campaign.name = '{name}' AND campaign.status != 'REMOVED'"
    )
    rows = [r for batch in ga.search_stream(customer_id=customer_id, query=query) for r in batch.results]
    if not rows:
        sys.exit(f"No campaign named '{name}' found.")
    return rows[0].campaign


def apply_or_print(args, description: str, fn):
    if args.apply:
        result = fn()
        print(f"APPLIED: {description}")
        return result
    print(f"DRY RUN (add --apply to execute): {description}")
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["pause", "enable", "set-budget", "set-cpc-cap", "add-negative", "remove-negative"])
    parser.add_argument("--campaign", required=True)
    parser.add_argument("--amount", type=float, help="Budget dollars/day (set-budget)")
    parser.add_argument("--cap", type=float, help="Max CPC dollars (set-cpc-cap)")
    parser.add_argument("--keyword", help="Negative keyword text")
    parser.add_argument("--match", default="BROAD", choices=["BROAD", "PHRASE", "EXACT"])
    parser.add_argument("--apply", action="store_true", help="Execute (default is dry run)")
    parser.add_argument("--allow-any-campaign", action="store_true")
    parser.add_argument("--customer", help="Customer id override")
    args = parser.parse_args()

    client = make_client()
    customer_id = (args.customer or default_customer_id()).replace("-", "")
    campaign = find_campaign(client, customer_id, args.campaign, args.allow_any_campaign)

    if args.action in ("pause", "enable"):
        status = client.enums.CampaignStatusEnum.PAUSED if args.action == "pause" else client.enums.CampaignStatusEnum.ENABLED

        def run():
            svc = client.get_service("CampaignService")
            op = client.get_type("CampaignOperation")
            op.update.resource_name = client.get_service("CampaignService").campaign_path(customer_id, campaign.id)
            op.update.status = status
            client.copy_from(op.update_mask, client.get_type("FieldMask")(paths=["status"]))
            return svc.mutate_campaigns(customer_id=customer_id, operations=[op])

        apply_or_print(args, f"{args.action} campaign '{campaign.name}' (currently {campaign.status.name})", run)

    elif args.action == "set-budget":
        if not args.amount:
            sys.exit("--amount required")

        def run():
            svc = client.get_service("CampaignBudgetService")
            op = client.get_type("CampaignBudgetOperation")
            op.update.resource_name = campaign.campaign_budget
            op.update.amount_micros = micros(args.amount)
            client.copy_from(op.update_mask, client.get_type("FieldMask")(paths=["amount_micros"]))
            return svc.mutate_campaign_budgets(customer_id=customer_id, operations=[op])

        apply_or_print(args, f"set '{campaign.name}' daily budget to ${args.amount:.2f}", run)

    elif args.action == "set-cpc-cap":
        if not args.cap:
            sys.exit("--cap required")

        def run():
            svc = client.get_service("CampaignService")
            op = client.get_type("CampaignOperation")
            op.update.resource_name = svc.campaign_path(customer_id, campaign.id)
            op.update.target_spend.cpc_bid_ceiling_micros = micros(args.cap)
            client.copy_from(op.update_mask, client.get_type("FieldMask")(paths=["target_spend.cpc_bid_ceiling_micros"]))
            return svc.mutate_campaigns(customer_id=customer_id, operations=[op])

        apply_or_print(args, f"set '{campaign.name}' Maximize Clicks CPC ceiling to ${args.cap:.2f}", run)

    elif args.action == "add-negative":
        if not args.keyword:
            sys.exit("--keyword required")

        def run():
            svc = client.get_service("CampaignCriterionService")
            op = client.get_type("CampaignCriterionOperation")
            crit = op.create
            crit.campaign = client.get_service("CampaignService").campaign_path(customer_id, campaign.id)
            crit.negative = True
            crit.keyword.text = args.keyword
            crit.keyword.match_type = getattr(client.enums.KeywordMatchTypeEnum, args.match)
            return svc.mutate_campaign_criteria(customer_id=customer_id, operations=[op])

        apply_or_print(args, f"add negative [{args.match}] '{args.keyword}' to '{campaign.name}'", run)

    elif args.action == "remove-negative":
        if not args.keyword:
            sys.exit("--keyword required")
        ga = client.get_service("GoogleAdsService")
        query = (
            "SELECT campaign_criterion.resource_name, campaign_criterion.keyword.text "
            "FROM campaign_criterion "
            f"WHERE campaign.id = {campaign.id} AND campaign_criterion.negative = TRUE "
            f"AND campaign_criterion.keyword.text = '{args.keyword}'"
        )
        rows = [r for batch in ga.search_stream(customer_id=customer_id, query=query) for r in batch.results]
        if not rows:
            sys.exit(f"No negative keyword '{args.keyword}' on '{campaign.name}'.")

        def run():
            svc = client.get_service("CampaignCriterionService")
            ops = []
            for row in rows:
                op = client.get_type("CampaignCriterionOperation")
                op.remove = row.campaign_criterion.resource_name
                ops.append(op)
            return svc.mutate_campaign_criteria(customer_id=customer_id, operations=ops)

        apply_or_print(args, f"remove negative '{args.keyword}' from '{campaign.name}' ({len(rows)} row)", run)


if __name__ == "__main__":
    main()
