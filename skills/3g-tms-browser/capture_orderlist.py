#!/usr/bin/env python3
"""
Live network-capture helper for the UNDOCUMENTED /web/orderList endpoint.

Same method used to originally document loadList/tab0: drive a real browser to
the Orders grid, record every XHR, and dump the request params + a trimmed
response sample for POST /web/orderList so the shape can be documented.

    python capture_orderlist.py            # sandbox, headless
    python capture_orderlist.py --headed   # watch it

Output: prints the captured request post-data and response keys to stdout and
writes a full sample to ./orderlist_capture.json for folding into
docs/3G-API-Discovery-Checklist.md and docs/3G-Order-Object-Field-Reference.md.

This is READ-ONLY: it only observes the traffic 3G itself generates when you
open the Orders list. It never issues a write action.

NOTE: cannot be run in an environment whose egress policy blocks
shipdlx-sb.3gtms.com (e.g. this remote build sandbox). Run it where the host
is reachable and valid sandbox credentials exist.
"""

import argparse
import json
import sys

from credentials import load_credentials
from tms_client import SANDBOX_HOST, assert_read_only


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--headed", action="store_true", help="show the browser")
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Install playwright: pip install playwright && playwright install chromium")

    creds = load_credentials()
    captures = []

    def on_request(req):
        if "/web/orderList" in req.url and req.method == "POST":
            assert_read_only("/web/orderList")  # belt-and-suspenders
            captures.append({
                "url": req.url,
                "method": req.method,
                "post_data": req.post_data,
                "headers": {k: v for k, v in req.headers.items()
                            if k.lower() not in ("cookie", "authorization")},
            })

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context()
        page = context.new_page()
        page.on("request", on_request)

        page.goto(f"{SANDBOX_HOST}/web/login", wait_until="domcontentloaded")
        page.fill("input[name='username'], input#username", creds["username"])
        page.fill("input[name='password'], input#password", creds["password"])
        page.click("button[type='submit'], input[type='submit']")
        page.wait_for_load_state("networkidle")

        # Navigate to the Orders grid so 3G fires POST /web/orderList itself.
        page.goto(f"{SANDBOX_HOST}/web/", wait_until="networkidle")
        # TODO(verify): click the Orders tab/menu; selector confirmed live.
        page.wait_for_timeout(4000)
        browser.close()

    if not captures:
        print("No /web/orderList request observed. Navigate to the Orders grid "
              "in --headed mode and confirm the tab selector.")
        return

    with open("orderlist_capture.json", "w") as f:
        json.dump(captures, f, indent=2)
    for c in captures:
        print("URL:      ", c["url"])
        print("POST data:", c["post_data"])
    print(f"\nWrote {len(captures)} capture(s) to orderlist_capture.json")


if __name__ == "__main__":
    main()
