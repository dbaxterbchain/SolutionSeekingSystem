"""Shared config + client bootstrap for the ads toolkit.

Credentials come from (first match wins):
1. GOOGLE_ADS_* environment variables (including ones loaded from the repo .env)
2. ~/.google-ads.yaml (the google-ads library's default)

Nothing here is ever committed: .env and the yaml are untracked. See
docs/ads-api-setup.md for the one-time setup.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def load_repo_env() -> None:
    """Load GOOGLE_ADS_* lines from the repo .env into os.environ (no deps)."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key.startswith("GOOGLE_ADS_") and key not in os.environ:
            os.environ[key] = value.strip().strip('"')
    # The library requires this one; default it so .env stays minimal.
    os.environ.setdefault("GOOGLE_ADS_USE_PROTO_PLUS", "true")


def make_client():
    from google.ads.googleads.client import GoogleAdsClient

    load_repo_env()
    if os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN"):
        return GoogleAdsClient.load_from_env()
    yaml_path = Path.home() / "google-ads.yaml"
    dot_yaml = Path.home() / ".google-ads.yaml"
    if dot_yaml.exists():
        return GoogleAdsClient.load_from_storage(str(dot_yaml))
    if yaml_path.exists():
        return GoogleAdsClient.load_from_storage(str(yaml_path))
    sys.exit(
        "No credentials: set GOOGLE_ADS_* in the repo .env or create ~/.google-ads.yaml "
        "(see docs/ads-api-setup.md)."
    )


def default_customer_id() -> str:
    load_repo_env()
    cid = os.environ.get("GOOGLE_ADS_CUSTOMER_ID", "").replace("-", "")
    if not cid:
        sys.exit("Set GOOGLE_ADS_CUSTOMER_ID in .env (the ad account id, digits only).")
    return cid


SCOPE_PREFIXES = ("SSS", "Solution Seeking")
# The owner's coffee-shop campaigns. Off limits by default; each command that
# touches them requires the explicit --beanchain flag, passed only when the
# owner asked for Beanchain work in the current session.
BEANCHAIN_CAMPAIGNS = ("Coffee Shop For You", "Get People into Shop")


def check_campaign_scope(name: str, beanchain: bool = False) -> None:
    """Exit unless `name` is an SSS campaign, or a Beanchain campaign explicitly unlocked."""
    if name.startswith(SCOPE_PREFIXES):
        return
    if name in BEANCHAIN_CAMPAIGNS:
        if beanchain:
            return
        sys.exit(
            f"Scope guard: '{name}' is a Beanchain shop campaign. Add --beanchain only "
            "when the owner has explicitly asked for Beanchain changes this session."
        )
    sys.exit(
        f"Scope guard: '{name}' matches neither the SSS prefixes {SCOPE_PREFIXES} nor "
        f"the Beanchain allowlist {BEANCHAIN_CAMPAIGNS}; refusing."
    )


def micros(dollars: float) -> int:
    return round(dollars * 1_000_000)


def from_micros(value: int | None) -> str:
    return f"${(value or 0) / 1_000_000:,.2f}"
