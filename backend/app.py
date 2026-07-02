"""
Minimal read-only proxy between the wireframe frontend and 3G TMS (sandbox),
now with a login flow so credentials are entered in the UI instead of being
pre-encrypted on disk.

Flow:
    Browser login screen --POST /api/login {username,password}--> this backend
    --Playwright login--> 3G sandbox. The backend keeps only the resulting
    session (server-side, in memory) and hands the browser an opaque httpOnly
    cookie. The password is used once and never stored or logged.

The browser NEVER talks to 3G directly. In the Cloudflare deploy the Worker
proxies /api/* to this backend (BACKEND_URL) because a Worker can't run
Playwright.

Endpoints:
    GET  /api/health
    GET  /api/session            -> {authenticated, mode, loginRequired}
    POST /api/login  {username, password}
    POST /api/logout
    GET  /api/loads?savedQueryId=&page=&pageSize=
    GET  /api/orders?page=&pageSize=

Modes:
    USE_FIXTURES=1  -> serve local fixtures (offline). With LOGIN_REQUIRED=1 the
                       login gate is still shown (demo: any non-empty creds).
    otherwise       -> live sandbox: login required; list calls use the caller's
                       authenticated session.
"""

from __future__ import annotations

import json
import os
import secrets
import sys
import time
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

# Make the skill importable.
SKILL_DIR = Path(__file__).resolve().parent.parent / "skills" / "3g-tms-browser"
sys.path.insert(0, str(SKILL_DIR))

FIXTURES = Path(__file__).resolve().parent / "fixtures"
SESSION_COOKIE = "tms_session"
SESSION_TTL = int(os.environ.get("SESSION_TTL_SECONDS", 12 * 3600))

app = Flask(__name__)

# Credentialed CORS: with cookies, the allowed origin can't be "*". Set
# FRONTEND_ORIGIN to your Pages URL for cross-origin prod; same-origin dev
# (Vite proxy) needs no CORS at all.
_frontend_origin = os.environ.get("FRONTEND_ORIGIN", "*")
CORS(
    app,
    resources={r"/api/*": {"origins": _frontend_origin}},
    supports_credentials=(_frontend_origin != "*"),
)

# token -> {"client": TmsClient|None, "created": float, "user": str}
_SESSIONS: dict[str, dict] = {}


def _mode() -> str:
    return "fixtures" if os.environ.get("USE_FIXTURES") == "1" else "live"


def _login_required() -> bool:
    return _mode() == "live" or os.environ.get("LOGIN_REQUIRED") == "1"


def _fixture(name: str):
    return json.loads((FIXTURES / name).read_text())


def _new_session(user: str, client) -> str:
    token = secrets.token_urlsafe(32)
    _SESSIONS[token] = {"client": client, "created": time.time(), "user": user}
    return token


def _current_session():
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None, None
    sess = _SESSIONS.get(token)
    if not sess:
        return token, None
    if time.time() - sess["created"] > SESSION_TTL:
        _SESSIONS.pop(token, None)
        return token, None
    return token, sess


def _set_cookie(resp, token: str):
    # SameSite=Lax for same-origin/same-site (custom domain). For a cross-site
    # setup (frontend on *.pages.dev, backend on *.workers.dev) set
    # COOKIE_SAMESITE=None — which the browser only honors on a Secure cookie,
    # so FORCE_SECURE_COOKIE=1 must be set too.
    samesite = os.environ.get("COOKIE_SAMESITE", "Lax")
    secure = request.is_secure or os.environ.get("FORCE_SECURE_COOKIE") == "1"
    resp.set_cookie(
        SESSION_COOKIE, token,
        httponly=True,
        samesite=samesite,
        secure=secure or samesite == "None",
        max_age=SESSION_TTL,
        path="/",
    )
    return resp


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "mode": _mode(), "host": "shipdlx-sb.3gtms.com"})


@app.get("/api/session")
def session():
    _, sess = _current_session()
    return jsonify({
        "authenticated": bool(sess),
        "mode": _mode(),
        "loginRequired": _login_required(),
        "user": sess["user"] if sess else None,
    })


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    if _mode() == "fixtures":
        # Demo login: no real 3G call, serve fixtures after "auth".
        token = _new_session(username, client=None)
        return _set_cookie(jsonify({"ok": True, "mode": "fixtures", "user": username}), token)

    # Live: authenticate to the sandbox via Playwright. Password is used here and
    # not retained. Never logged.
    try:
        from tms_client import TmsClient
        client = TmsClient(sandbox=True)  # sandbox-only, enforced in the client
        client.login(username, password)
    except Exception as exc:  # noqa: BLE001 - surface a generic auth failure
        # Do not echo credentials or internal detail beyond a short reason.
        return jsonify({"error": "login failed", "detail": str(exc)[:200]}), 401
    finally:
        password = None  # drop the plaintext reference promptly

    token = _new_session(username, client=client)
    return _set_cookie(jsonify({"ok": True, "mode": "live", "user": username}), token)


@app.post("/api/logout")
def logout():
    token, _ = _current_session()
    if token:
        _SESSIONS.pop(token, None)
    resp = jsonify({"ok": True})
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


def _require_session():
    """Return (session, error_response). error_response is None when OK."""
    if not _login_required():
        return None, None
    _, sess = _current_session()
    if not sess:
        return None, (jsonify({"error": "not authenticated"}), 401)
    return sess, None


@app.get("/api/loads")
def loads():
    sess, err = _require_session()
    if err:
        return err
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("pageSize", 50))
    saved_query_id = request.args.get("savedQueryId", "")

    if _mode() == "fixtures":
        return jsonify({**_fixture("loads.json"), "_mode": "fixtures"})

    if not saved_query_id:
        return jsonify({"error": "savedQueryId is required for live loads"}), 400
    try:
        data = sess["client"].list_loads(saved_query_id, pagenum=page, pagesize=page_size)
        return jsonify({"Rows": _rows(data), "_mode": "live-sandbox"})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)[:200], "_mode": "live-sandbox"}), 502


@app.get("/api/orders")
def orders():
    sess, err = _require_session()
    if err:
        return err
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("pageSize", 50))

    if _mode() == "fixtures":
        return jsonify({**_fixture("orders.json"), "_mode": "fixtures"})

    try:
        data = sess["client"].list_orders(pagenum=page, pagesize=page_size)
        return jsonify({"Rows": _rows(data), "_mode": "live-sandbox"})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)[:200], "_mode": "live-sandbox"}), 502


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
    # Debug off by default: the Werkzeug interactive debugger can expose request
    # locals (incl. a submitted password) on an exception. Opt in with FLASK_DEBUG=1.
    app.run(
        host="127.0.0.1",
        port=int(os.environ.get("PORT", 5001)),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
