# Backend proxy

Small Flask proxy so the browser never talks to 3G directly. Calls the
`3g-tms-browser` skill and returns plain JSON.

## Run (offline / fixtures — works anywhere)

```bash
pip install -r requirements.txt
USE_FIXTURES=1 python app.py           # http://127.0.0.1:5001
```

```bash
curl http://127.0.0.1:5001/api/health
curl "http://127.0.0.1:5001/api/loads?savedQueryId=demo&page=1"
curl "http://127.0.0.1:5001/api/orders?page=1"
```

## Run (live sandbox)

Requires: reachable `shipdlx-sb.3gtms.com`, Playwright, and encrypted
credentials (`../skills/3g-tms-browser/encrypt_credentials.py`).

```bash
pip install -r requirements.txt playwright && playwright install chromium
USE_FIXTURES=0 python app.py
curl "http://127.0.0.1:5001/api/loads?savedQueryId=<realSavedQueryId>&page=1"
```

If credentials aren't configured, the proxy auto-falls back to fixtures mode.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | reports `fixtures` vs `live-sandbox` mode |
| GET | `/api/loads?savedQueryId=&page=&pageSize=` | `savedQueryId` required when live |
| GET | `/api/orders?page=&pageSize=` | param shape pending live capture |

Read-only and sandbox-only are enforced in the client
(`skills/3g-tms-browser/tms_client.py`), not just here.
