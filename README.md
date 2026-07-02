# Modified TMS UI — 3G Sandbox Read-Only Wireframe (POC)

Proof-of-concept confirming DLX can pull real **Order** and **Load** data out of
3G TMS programmatically and render it. **Read-only. Sandbox only.** No
drag-and-drop, no editing, nothing touching production.

```
skills/3g-tms-browser/   Playwright+requests client (sandbox flag, read-only guard, Fernet creds)
backend/                 Flask proxy: GET /api/loads, GET /api/orders  (+ offline fixtures)
frontend/                Vite + React + Tailwind v4 wireframe — two columns, Loads | Orders
cloudflare/              Separate NEW Worker skeleton (isolated from B.R.A.T. prod)
docs/                    Load/Order field references + API discovery checklist
```

## Hard constraints honored

| Constraint | How |
|-----------|-----|
| Sandbox only (`shipdlx-sb.3gtms.com`) | Default host in the client; list helpers refuse production; Worker refuses production |
| Read-only | `assert_read_only()` allow-lists only `loadList`/`orderList` and rejects any write verb before a request is sent |
| No plaintext credentials | Fernet-encrypted, chmod 600, outside the repo; `*.enc`/`*.key` gitignored |
| No browser→3G direct calls | Browser only talks to the Flask/Worker proxy; proxy talks to 3G |

## Quick start (offline — works anywhere)

```bash
# 1. backend (fixtures mode — no 3G access needed)
cd backend && pip install -r requirements.txt && USE_FIXTURES=1 python app.py

# 2. frontend (separate terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

The header badge shows **FIXTURES (offline)** vs **LIVE SANDBOX**.

To exercise the **login screen** offline, run the backend with
`USE_FIXTURES=1 LOGIN_REQUIRED=1` — any username/password signs in and shows
sample data. In live mode the login is real: credentials are used once to open a
3G sandbox session, the browser keeps only an `httpOnly` session cookie, and
nothing is stored or logged. The UI login requires the Flask backend (a Worker
can't run Playwright) — see `DEPLOY.md`.

## Going live (needs sandbox access + credentials)

```bash
cd skills/3g-tms-browser
pip install -r requirements.txt && playwright install chromium
python encrypt_credentials.py           # store encrypted sandbox creds outside repo
python capture_orderlist.py --headed    # capture the undocumented /web/orderList shape
# then:  USE_FIXTURES=0 python ../../backend/app.py
#        open http://localhost:5173/?savedQueryId=<realSavedQueryId>
```

## Deploy (Cloudflare Pages + Worker, live sandbox)

Full-stack Cloudflare deploy — Pages for the UI, the separate sandbox-only
Worker for `/api`, live data via a rotated session cookie. See
**[`DEPLOY.md`](DEPLOY.md)**. CI: `.github/workflows/deploy.yml`.

## ⚠️ What is NOT done yet, and why

This scaffolding was built in an environment whose **network policy blocks
egress to `shipdlx-sb.3gtms.com`** (the agent proxy returns HTTP 403 on
CONNECT), and no sandbox credentials were available here. So the steps that
require live 3G access are **deferred to a run that has sandbox access**:

- [ ] Capture the real `POST /web/orderList` request/response shape
      (`capture_orderlist.py`) and document it.
- [ ] Fill `docs/3G-Order-Object-Field-Reference.md` from a real Order record
      (currently **provisional**).
- [ ] Confirm the live `/web/login` form selectors.
- [ ] Render live sandbox Loads/Orders and confirm the network log has **zero**
      write/action calls.

Everything else — client, read-only guard, proxy, wireframe, docs skeleton,
fixture render path — is complete and runs today against local fixtures.

Reference docs `3G-Load-Object-Field-Reference.md` and the original
`3G-API-Discovery-Checklist.md` were meant to be attached to the task but were
not present in this environment; `docs/3G-API-Discovery-Checklist.md` here
captures the known state and open questions.
