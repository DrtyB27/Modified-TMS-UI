#!/usr/bin/env python3
"""
Refresh the sandbox session cookie used by the Cloudflare Worker (live mode).

A Cloudflare Worker can't run Playwright, so it authenticates to 3G with an
injected session cookie (TMS_SESSION_COOKIE). That cookie expires, so this
helper logs in fresh (READ-ONLY: it only signs in, never issues an action) and
prints the cookie string ready to pipe into `wrangler secret put`.

Run this where egress to shipdlx-sb.3gtms.com is allowed and the encrypted
credentials exist:

    python refresh_session.py                       # prints the cookie header
    python refresh_session.py --wrangler | sh       # updates the Worker secret

The printed value is a secret — it is not logged anywhere and should only be
handed to `wrangler secret put`.

NOTE: cannot run in an environment whose egress policy blocks the sandbox host
(e.g. the build sandbox, where CONNECT returns 403).
"""

import argparse
import sys

from credentials import load_credentials
from tms_client import SANDBOX_HOST


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wrangler", action="store_true",
                    help="emit a `wrangler secret put` command instead of the raw cookie")
    ap.add_argument("--name", default="dlx-tms-sandbox-wireframe",
                    help="Worker name for the wrangler command")
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Install playwright: pip install playwright && playwright install chromium")

    creds = load_credentials()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.goto(f"{SANDBOX_HOST}/web/login", wait_until="domcontentloaded")
        page.fill("input[name='username'], input#username", creds["username"])
        page.fill("input[name='password'], input#password", creds["password"])
        page.click("button[type='submit'], input[type='submit']")
        page.wait_for_load_state("networkidle")
        cookies = context.cookies()
        browser.close()

    # Cookie header string for the sandbox host only.
    host = SANDBOX_HOST.replace("https://", "")
    pairs = [f"{c['name']}={c['value']}" for c in cookies
             if host in (c.get("domain") or "") or c.get("domain", "").lstrip(".") in host]
    if not pairs:
        sys.exit("No session cookies captured — check login selectors / credentials.")
    cookie_header = "; ".join(pairs)

    if args.wrangler:
        # printf keeps the secret off the argv of `wrangler`.
        print(f"printf %s {cookie_header!r} | wrangler secret put TMS_SESSION_COOKIE "
              f"--name {args.name}")
    else:
        print(cookie_header)


if __name__ == "__main__":
    main()
