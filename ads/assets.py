"""Asset management for campaigns and PMax asset groups.

Safety contract (same as manage.py):
- DRY-RUN BY DEFAULT for every command that mutates the account; add --apply.
- SCOPE GUARD: SSS campaigns by default; the two Beanchain shop campaigns only
  with --beanchain (explicit owner request in the current session). `prep` is
  local-only (writes cropped files, no API mutation) and needs no --apply.

Usage:
    uv run assets.py list --campaign "Get People into Shop" --beanchain
    uv run assets.py list-images                     # account image library
    uv run assets.py prep --file photo.jpg --out-dir crops
    uv run assets.py upload-image --file crops/photo_square.jpg --name "Counter 2024 square" [--apply]
    uv run assets.py link-image --asset-group 123 --asset customers/X/assets/Y --field SQUARE_MARKETING_IMAGE --beanchain [--apply]
    uv run assets.py unlink --asset-group 123 --asset customers/X/assets/Y --beanchain [--apply]
    uv run assets.py add-callout --campaign "..." --text "Free Wi-Fi" --beanchain [--apply]
    uv run assets.py add-snippet --campaign "..." --header Types --values "Espresso,Cold Brew" --beanchain [--apply]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _common import make_client, default_customer_id, check_campaign_scope

# PMax image slots: field type -> (aspect w/h, min WxH, recommended WxH)
IMAGE_FIELDS = {
    "MARKETING_IMAGE": (1.91, (600, 314), (1200, 628)),
    "SQUARE_MARKETING_IMAGE": (1.0, (300, 300), (1200, 1200)),
    "PORTRAIT_MARKETING_IMAGE": (0.8, (480, 600), (960, 1200)),
    "LOGO": (1.0, (128, 128), (1200, 1200)),
    "LANDSCAPE_LOGO": (4.0, (512, 128), (1200, 300)),
}
RATIO_TOLERANCE = 0.01
# prep output: label -> (aspect w/h, target WxH)
PREP_CROPS = {
    "landscape": (1.91, (1200, 628)),
    "square": (1.0, (1200, 1200)),
    "portrait": (0.8, (960, 1200)),
}


def gaql(client, customer_id, query):
    ga = client.get_service("GoogleAdsService")
    return [r for batch in ga.search_stream(customer_id=customer_id, query=query) for r in batch.results]


def find_campaign(client, customer_id, name, beanchain):
    check_campaign_scope(name, beanchain)
    rows = gaql(
        client, customer_id,
        "SELECT campaign.id, campaign.name FROM campaign "
        f"WHERE campaign.name = '{name}' AND campaign.status != 'REMOVED'",
    )
    if not rows:
        sys.exit(f"No campaign named '{name}' found.")
    return rows[0].campaign


def find_asset_group(client, customer_id, group_id, beanchain):
    rows = gaql(
        client, customer_id,
        "SELECT asset_group.id, asset_group.name, asset_group.resource_name, campaign.name "
        f"FROM asset_group WHERE asset_group.id = {int(group_id)}",
    )
    if not rows:
        sys.exit(f"No asset group with id {group_id}.")
    check_campaign_scope(rows[0].campaign.name, beanchain)
    return rows[0]


def apply_or_print(args, description, fn):
    if args.apply:
        result = fn()
        print(f"APPLIED: {description}")
        return result
    print(f"DRY RUN (add --apply to execute): {description}")
    return None


def cmd_list(client, customer_id, args):
    campaign = find_campaign(client, customer_id, args.campaign, args.beanchain)
    print(f"== campaign-level assets: {campaign.name} ==")
    for r in gaql(
        client, customer_id,
        "SELECT campaign.id, campaign_asset.field_type, campaign_asset.resource_name, "
        "asset.id, asset.name, asset.callout_asset.callout_text, "
        "asset.structured_snippet_asset.header, asset.sitelink_asset.link_text "
        f"FROM campaign_asset WHERE campaign.id = {campaign.id} AND campaign_asset.status != 'REMOVED'",
    ):
        label = (
            r.asset.callout_asset.callout_text
            or r.asset.sitelink_asset.link_text
            or r.asset.structured_snippet_asset.header
            or r.asset.name
        )
        print(f"  {r.campaign_asset.field_type.name:26} asset {r.asset.id}  {label}")

    for r in gaql(
        client, customer_id,
        "SELECT asset_group.id, asset_group.name, asset_group.ad_strength, "
        "asset_group_asset.field_type, asset.id, asset.name, asset.type, "
        "asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels, "
        "asset.youtube_video_asset.youtube_video_id, asset.text_asset.text, "
        "asset.resource_name "
        f"FROM asset_group_asset WHERE campaign.id = {campaign.id} "
        "AND asset_group_asset.status != 'REMOVED' "
        "ORDER BY asset_group.id, asset_group_asset.field_type",
    ):
        img = r.asset.image_asset.full_size
        detail = r.asset.text_asset.text or r.asset.youtube_video_asset.youtube_video_id or r.asset.name
        dims = f" {img.width_pixels}x{img.height_pixels}" if img.width_pixels else ""
        print(
            f"  group {r.asset_group.id} ({r.asset_group.name}, strength {r.asset_group.ad_strength.name}) "
            f"| {r.asset_group_asset.field_type.name:26}{dims} | asset {r.asset.id} | {detail}"
        )


def cmd_list_images(client, customer_id, args):
    for r in gaql(
        client, customer_id,
        "SELECT asset.id, asset.name, asset.resource_name, "
        "asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels, "
        "asset.image_asset.file_size FROM asset WHERE asset.type = 'IMAGE' ORDER BY asset.id",
    ):
        img = r.asset.image_asset
        ratio = (img.full_size.width_pixels / img.full_size.height_pixels) if img.full_size.height_pixels else 0
        print(
            f"{r.asset.resource_name} | {img.full_size.width_pixels}x{img.full_size.height_pixels} "
            f"(ratio {ratio:.2f}) | {r.asset.name}"
        )


def cmd_prep(client, customer_id, args):
    from PIL import Image, ImageOps

    src = Path(args.file)
    if not src.exists():
        sys.exit(f"No such file: {src}")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    w, h = im.size
    print(f"{src.name}: {w}x{h}")
    for label, (aspect, (tw, th)) in PREP_CROPS.items():
        cw, ch = (w, round(w / aspect)) if w / h >= aspect else (round(h * aspect), h)
        if cw > w or ch > h:
            cw, ch = min(cw, w), min(ch, h)
        left, top = (w - cw) // 2, (h - ch) // 2
        crop = im.crop((left, top, left + cw, top + ch))
        if cw < tw * 0.5:  # would need >2x upscale to hit recommended size; skip
            print(f"  skip {label}: crop {cw}x{ch} too small for {tw}x{th}")
            continue
        if cw > tw:
            crop = crop.resize((tw, th), Image.LANCZOS)
        out = out_dir / f"{src.stem}_{label}.jpg"
        crop.save(out, "JPEG", quality=90)
        print(f"  wrote {out} ({crop.size[0]}x{crop.size[1]})")


def cmd_upload_image(client, customer_id, args):
    from PIL import Image

    src = Path(args.file)
    if not src.exists():
        sys.exit(f"No such file: {src}")
    data = src.read_bytes()
    if len(data) > 5_000_000:
        sys.exit(f"{src.name} is {len(data):,} bytes; Google Ads images must be under 5MB.")
    w, h = Image.open(src).size

    def run():
        svc = client.get_service("AssetService")
        op = client.get_type("AssetOperation")
        op.create.name = args.name
        op.create.image_asset.data = data
        res = svc.mutate_assets(customer_id=customer_id, operations=[op]).results[0].resource_name
        print(f"  asset: {res}")
        return res

    apply_or_print(args, f"upload image '{args.name}' ({src.name}, {w}x{h}, {len(data):,} bytes)", run)


def cmd_link_image(client, customer_id, args):
    group = find_asset_group(client, customer_id, args.asset_group, args.beanchain)
    field = args.field.upper()
    if field not in IMAGE_FIELDS:
        sys.exit(f"--field must be one of {', '.join(IMAGE_FIELDS)}")
    aspect, (min_w, min_h), _ = IMAGE_FIELDS[field]
    rows = gaql(
        client, customer_id,
        "SELECT asset.id, asset.name, asset.image_asset.full_size.width_pixels, "
        "asset.image_asset.full_size.height_pixels FROM asset "
        f"WHERE asset.resource_name = '{args.asset}'",
    )
    if not rows:
        sys.exit(f"No asset {args.asset}.")
    a = rows[0].asset
    w, h = a.image_asset.full_size.width_pixels, a.image_asset.full_size.height_pixels
    if not w:
        sys.exit(f"Asset {a.id} is not an image.")
    if abs(w / h - aspect) / aspect > RATIO_TOLERANCE:
        sys.exit(f"Asset {a.id} is {w}x{h} (ratio {w / h:.3f}); {field} needs {aspect} +/-1%. Use `prep` to crop first.")
    if w < min_w or h < min_h:
        sys.exit(f"Asset {a.id} is {w}x{h}; {field} minimum is {min_w}x{min_h}.")

    def run():
        svc = client.get_service("AssetGroupAssetService")
        op = client.get_type("AssetGroupAssetOperation")
        op.create.asset_group = group.asset_group.resource_name
        op.create.asset = args.asset
        op.create.field_type = getattr(client.enums.AssetFieldTypeEnum, field)
        return svc.mutate_asset_group_assets(customer_id=customer_id, operations=[op])

    apply_or_print(
        args,
        f"link asset {a.id} ('{a.name}', {w}x{h}) to group {group.asset_group.id} ({group.asset_group.name}) as {field}",
        run,
    )


def cmd_unlink(client, customer_id, args):
    group = find_asset_group(client, customer_id, args.asset_group, args.beanchain)
    rows = gaql(
        client, customer_id,
        "SELECT asset_group_asset.resource_name, asset_group_asset.field_type, asset.id, asset.name "
        f"FROM asset_group_asset WHERE asset_group.id = {group.asset_group.id} "
        "AND asset_group_asset.status != 'REMOVED'",
    )
    wanted_id = args.asset.split("/")[-1]
    targets = [r for r in rows if str(r.asset.id) == wanted_id]
    if not targets:
        sys.exit(f"Asset {args.asset} is not linked to group {group.asset_group.id}.")
    if args.field:
        targets = [r for r in targets if r.asset_group_asset.field_type.name == args.field.upper()]
        if not targets:
            sys.exit(f"Asset {args.asset} is not linked as {args.field.upper()}.")
    for t in targets:
        ft = t.asset_group_asset.field_type
        remaining = sum(1 for r in rows if r.asset_group_asset.field_type == ft) - 1
        if remaining < 1:
            sys.exit(
                f"Refusing: removing asset {t.asset.id} would leave 0 {ft.name} assets in "
                f"group {group.asset_group.id} (PMax requires at least one)."
            )

    def run():
        svc = client.get_service("AssetGroupAssetService")
        ops = []
        for t in targets:
            op = client.get_type("AssetGroupAssetOperation")
            op.remove = t.asset_group_asset.resource_name
            ops.append(op)
        return svc.mutate_asset_group_assets(customer_id=customer_id, operations=ops)

    names = ", ".join(f"{t.asset.id} ({t.asset.name}) as {t.asset_group_asset.field_type.name}" for t in targets)
    apply_or_print(args, f"unlink from group {group.asset_group.id} ({group.asset_group.name}): {names}", run)


def cmd_add_callout(client, customer_id, args):
    campaign = find_campaign(client, customer_id, args.campaign, args.beanchain)
    if len(args.text) > 25:
        sys.exit(f"Callout '{args.text}' is {len(args.text)} chars; max 25.")

    def run():
        asset_svc = client.get_service("AssetService")
        a_op = client.get_type("AssetOperation")
        a_op.create.callout_asset.callout_text = args.text
        asset_res = asset_svc.mutate_assets(customer_id=customer_id, operations=[a_op]).results[0].resource_name
        ca_svc = client.get_service("CampaignAssetService")
        c_op = client.get_type("CampaignAssetOperation")
        c_op.create.campaign = client.get_service("CampaignService").campaign_path(customer_id, campaign.id)
        c_op.create.asset = asset_res
        c_op.create.field_type = client.enums.AssetFieldTypeEnum.CALLOUT
        return ca_svc.mutate_campaign_assets(customer_id=customer_id, operations=[c_op])

    apply_or_print(args, f"add callout '{args.text}' to '{campaign.name}'", run)


def cmd_add_snippet(client, customer_id, args):
    campaign = find_campaign(client, customer_id, args.campaign, args.beanchain)
    values = [v.strip() for v in args.values.split(",") if v.strip()]
    if len(values) < 3:
        sys.exit("Structured snippets need at least 3 values.")
    too_long = [v for v in values if len(v) > 25]
    if too_long:
        sys.exit(f"Snippet values over 25 chars: {too_long}")

    def run():
        asset_svc = client.get_service("AssetService")
        a_op = client.get_type("AssetOperation")
        a_op.create.structured_snippet_asset.header = args.header
        a_op.create.structured_snippet_asset.values.extend(values)
        asset_res = asset_svc.mutate_assets(customer_id=customer_id, operations=[a_op]).results[0].resource_name
        ca_svc = client.get_service("CampaignAssetService")
        c_op = client.get_type("CampaignAssetOperation")
        c_op.create.campaign = client.get_service("CampaignService").campaign_path(customer_id, campaign.id)
        c_op.create.asset = asset_res
        c_op.create.field_type = client.enums.AssetFieldTypeEnum.STRUCTURED_SNIPPET
        return ca_svc.mutate_campaign_assets(customer_id=customer_id, operations=[c_op])

    apply_or_print(args, f"add structured snippet '{args.header}: {', '.join(values)}' to '{campaign.name}'", run)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["list", "list-images", "prep", "upload-image", "link-image", "unlink", "add-callout", "add-snippet"])
    parser.add_argument("--campaign", help="Campaign name (list, add-callout, add-snippet)")
    parser.add_argument("--asset-group", help="Asset group id (link-image, unlink)")
    parser.add_argument("--asset", help="Asset resource name, e.g. customers/X/assets/Y")
    parser.add_argument("--field", help="Image slot: " + ", ".join(IMAGE_FIELDS))
    parser.add_argument("--file", help="Image file path (prep, upload-image)")
    parser.add_argument("--name", help="Asset display name (upload-image)")
    parser.add_argument("--out-dir", help="Output directory (prep)")
    parser.add_argument("--text", help="Callout text (add-callout)")
    parser.add_argument("--header", help="Snippet header, e.g. Types (add-snippet)")
    parser.add_argument("--values", help="Comma-separated snippet values (add-snippet)")
    parser.add_argument("--apply", action="store_true", help="Execute (default is dry run)")
    parser.add_argument("--beanchain", action="store_true", help="Unlock the Beanchain campaign allowlist (explicit owner request only)")
    parser.add_argument("--customer", help="Customer id override")
    args = parser.parse_args()

    required = {
        "list": ["campaign"], "list-images": [], "prep": ["file", "out_dir"],
        "upload-image": ["file", "name"], "link-image": ["asset_group", "asset", "field"],
        "unlink": ["asset_group", "asset"], "add-callout": ["campaign", "text"],
        "add-snippet": ["campaign", "header", "values"],
    }
    missing = [f"--{r.replace('_', '-')}" for r in required[args.action] if not getattr(args, r)]
    if missing:
        sys.exit(f"{args.action} requires {', '.join(missing)}")

    client = make_client()
    customer_id = (args.customer or default_customer_id()).replace("-", "")
    handlers = {
        "list": cmd_list, "list-images": cmd_list_images, "prep": cmd_prep,
        "upload-image": cmd_upload_image, "link-image": cmd_link_image, "unlink": cmd_unlink,
        "add-callout": cmd_add_callout, "add-snippet": cmd_add_snippet,
    }
    handlers[args.action](client, customer_id, args)


if __name__ == "__main__":
    main()
