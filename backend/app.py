"""
Minimal read-only proxy between the wireframe frontend and 3G TMS (sandbox).

The browser NEVER talks to 3G directly (cookie/session auth won't survive a
cross-origin XHR). It talks only to this proxy, which uses the extended
3g-tms-browser skill to fetch Loads and Orders from the sandbox.

Endpoints:
    GET /api/health
    GET /api/loads?savedQueryId=<id>&page=<n>&pageSize=<n>
    GET /api/orders?page=<n>&pageSize=<n>

Offline/dev mode:
    Set USE_FIXTURES=1 (default when no credentials are configured) to serve
    the JSON fixtures in ./fixtures instead of calling 3G. This is what lets the
    wireframe render in environments -- like the build sandbox -- where egress
    to shipdlx-sb.3gtms.com is blocked.
"""

from __future__ import annotations

import json
import os
import sys
from functools import lru_cache
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

# Make the skill importable.
SKILL_DIR = Path(__file__).resolve().parent.parent / "skills" / "3g-tms-browser"
sys.path.insert(0, str(SKILL_DIR))

FIXTURES = Path(__file__).resolve().parent / "fixtures"

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})  # wireframe is same-machine dev


def _use_fixtures() -> bool:
    if os.environ.get("USE_FIXTURES") == "1":
        return True
    if os.environ.get("USE_FIXTURES") == "0":
        return False
    # Auto: fall back to fixtures if credentials aren't configured.
    try:
        from credentials import load_credentials  # noqa: F401
        load_credentials()
        return False
    except Exception:
        return True


def _fixture(name: str):
    return json.loads((FIXTURES / name).read_text())


@lru_cache(maxsize=1)
def _client():
    """Build and authenticate a TmsClient once, reuse the session."""
    from credentials import load_credentials
    from tms_client import TmsClient

    creds = load_credentials()
    client = TmsClient(sandbox=True)  # sandbox-only, enforced in the client
    client.login(creds["username"], creds["password"])
    return client


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "mode": "fixtures" if _use_fixtures() else "live-sandbox",
        "host": "shipdlx-sb.3gtms.com",
    })


@app.get("/api/loads")
def loads():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("pageSize", 50))
    saved_query_id = request.args.get("savedQueryId", "")

    if _use_fixtures():
        return jsonify({**_fixture("loads.json"), "_mode": "fixtures"})

    if not saved_query_id:
        return jsonify({"error": "savedQueryId is required for live loads"}), 400
    try:
        data = _client().list_loads(saved_query_id, pagenum=page, pagesize=page_size)
        return jsonify({"Rows": _rows(data), "_mode": "live-sandbox", "_raw": data})
    except Exception as exc:  # surface, don't leak internals
        return jsonify({"error": str(exc), "_mode": "live-sandbox"}), 502


@app.get("/api/orders")
def orders():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("pageSize", 50))

    if _use_fixtures():
        return jsonify({**_fixture("orders.json"), "_mode": "fixtures"})

    try:
        data = _client().list_orders(pagenum=page, pagesize=page_size)
        return jsonify({"Rows": _rows(data), "_mode": "live-sandbox", "_raw": data})
    except Exception as exc:
        return jsonify({"error": str(exc), "_mode": "live-sandbox"}), 502


def _rows(data):
    """3G list endpoints wrap rows differently across grids; normalize to a list."""
    if isinstance(data, dict):
        for key in ("Rows", "rows", "records", "data"):
            if key in data and isinstance(data[key], list):
                return data[key]
    if isinstance(data, list):
        return data
    return []


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5001)), debug=True)
