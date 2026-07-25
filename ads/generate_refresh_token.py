"""One-time helper: mint a Google Ads API refresh token via the desktop OAuth flow.

Usage (from the repo root or ads/):
    uv run --with google-ads python ads/generate_refresh_token.py \
        --client_id <ID>.apps.googleusercontent.com --client_secret <SECRET>

Opens a browser; sign in with the Google account that owns the Ads account and
approve. Prints the refresh token to paste into ~/.google-ads.yaml and .env.
Based on the official google-ads-python authentication example.
"""

import argparse

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPE = "https://www.googleapis.com/auth/adwords"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client_id", required=True)
    parser.add_argument("--client_secret", required=True)
    args = parser.parse_args()

    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": args.client_id,
                "client_secret": args.client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=[SCOPE],
    )
    credentials = flow.run_local_server(port=0, open_browser=True)
    print("\nRefresh token (put this in ~/.google-ads.yaml and .env):\n")
    print(credentials.refresh_token)


if __name__ == "__main__":
    main()
