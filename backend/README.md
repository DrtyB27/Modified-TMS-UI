# Backend proxy

Small Flask proxy so the browser never talks to 3G directly. Handles the login
(Playwright), holds the session server-side, and returns plain JSON. Calls the
`3g-tms-browser` skill.

## Login model

Credentials are entered in the UI, posted to `POST /api/login`, used **once** to
open a 3G sandbox session via Playwright, and then discarded — only the session
is kept (in memory, keyed by an opaque `httpOnly` cookie). The password is never
stored or logged.

## Run (offline / fixtures — works anywhere)

```bash
pip install -r requirements.txt
USE_FIXTURES=1 python app.py                 # data view, no login gate
USE_FIXTURES=1 LOGIN_REQUIRED=1 python app.py # show the login screen (demo: any creds)
```

## Run (live sandbox)

Requires reachable `shipdlx-sb.3gtms.com` + Playwright.

```bash
pip install -r requirements.txt playwright && playwright install chromium
python app.py            # live mode: login required, real 3G auth
```

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/api/health` | reports `fixtures` vs `live` |
| GET  | `/api/session` | `{authenticated, mode, loginRequired, user}` |
| POST | `/api/login` | `{username, password}` → opens session, sets cookie |
| POST | `/api/logout` | clears the session |
| GET  | `/api/loads?savedQueryId=&page=&pageSize=` | needs a session when login is required; `savedQueryId` required live |
| GET  | `/api/orders?page=&pageSize=` | needs a session when login is required |

## Env

| Var | Purpose |
|-----|---------|
| `USE_FIXTURES=1` | serve local fixtures instead of calling 3G |
| `LOGIN_REQUIRED=1` | force the login gate even in fixtures mode (demo) |
| `FRONTEND_ORIGIN` | exact Pages origin for credentialed CORS (cross-origin prod) |
| `FORCE_SECURE_COOKIE=1` | mark the session cookie `Secure` behind TLS termination |
| `SESSION_TTL_SECONDS` | session lifetime (default 12h) |
| `FLASK_DEBUG=1` | enable the debugger (off by default — it can expose request locals) |

Read-only and sandbox-only are enforced in the client
(`skills/3g-tms-browser/tms_client.py`), not just here.
