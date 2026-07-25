"""One-off: fix primary/secondary flags on the GA4-imported conversion actions.

Problem: traffic events (page_view, session_start, first_visit) and even
checkout_abandoned are PRIMARY conversions, while signup_completed is secondary.
That inflates the SSS campaigns' Conversions column and would mislead any future
Smart Bidding. The Beanchain shop campaigns are unaffected: their goals
(store visits, local actions, calls) are campaign-scoped and untouched here.

DRY-RUN BY DEFAULT: prints the before/after table. Add --apply to execute.
"""

from __future__ import annotations

import argparse
import sys

from google.protobuf import field_mask_pb2

from _common import make_client, default_customer_id

PREFIX = "Solution Seeking (web) "
DEMOTE = [
    "page_view",
    "session_start",
    "first_visit",
    "checkout_abandoned",
    "anon_chat_started",
    "email_captured",
    "form_start",
    "message_sent",
    "first_message_sent",
]
PROMOTE = ["signup_completed"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Execute (default is dry run)")
    parser.add_argument("--customer", help="Customer id override")
    args = parser.parse_args()

    client = make_client()
    customer_id = (args.customer or default_customer_id()).replace("-", "")
    ga = client.get_service("GoogleAdsService")
    rows = [
        r
        for batch in ga.search_stream(
            customer_id=customer_id,
            query=(
                "SELECT conversion_action.resource_name, conversion_action.name, "
                "conversion_action.primary_for_goal, conversion_action.status "
                "FROM conversion_action WHERE conversion_action.status = 'ENABLED'"
            ),
        )
        for r in batch.results
    ]
    by_name = {r.conversion_action.name: r.conversion_action for r in rows}

    changes = []  # (name, from, to, resource_name)
    for short in DEMOTE:
        ca = by_name.get(PREFIX + short)
        if ca is None:
            print(f"  missing (skipped): {PREFIX + short}")
        elif ca.primary_for_goal:
            changes.append((ca.name, True, False, ca.resource_name))
        else:
            print(f"  already secondary: {ca.name}")
    for short in PROMOTE:
        ca = by_name.get(PREFIX + short)
        if ca is None:
            sys.exit(f"Missing expected conversion action: {PREFIX + short}")
        elif not ca.primary_for_goal:
            changes.append((ca.name, False, True, ca.resource_name))
        else:
            print(f"  already primary: {ca.name}")

    if not changes:
        print("Nothing to change.")
        return
    print(f"\n{'' if args.apply else 'DRY RUN - '}planned changes (primary_for_goal):")
    for name, old, new, _ in changes:
        print(f"  {name}: {old} -> {new}")
    if not args.apply:
        print("\nAdd --apply to execute.")
        return

    svc = client.get_service("ConversionActionService")
    ops = []
    for _, _, new, resource_name in changes:
        op = client.get_type("ConversionActionOperation")
        op.update.resource_name = resource_name
        op.update.primary_for_goal = new
        client.copy_from(op.update_mask, field_mask_pb2.FieldMask(paths=["primary_for_goal"]))
        ops.append(op)
    svc.mutate_conversion_actions(customer_id=customer_id, operations=ops)
    print(f"\nAPPLIED: {len(ops)} conversion actions updated.")


if __name__ == "__main__":
    main()
