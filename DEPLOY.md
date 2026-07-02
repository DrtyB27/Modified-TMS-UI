# Deploy — Cloudflare Pages + Worker (live sandbox)

Full-stack deploy of the read-only 3G wireframe:

```
Browser ──▶ Cloudflare Pages (React UI)
                │  /api/*
                ▼
        Cloudflare Worker  ──▶  https://shipdlx-sb.3gtms.com   (SANDBOX ONLY)
        (dlx-tms-sandbox-wireframe)   read-only: loadList / orderList
```

## Guardrails (unchanged)

- **Sandbox only.** Worker refuses `TMS_ORIGIN` pointed at production; frontend
  never calls 3G directly.
- **Read-only.** Worker allow-lists only `loadList/tab0` + `orderList` and
  rejects any write verb.
- **Isolated.** This is a **separate, new** Worker
  (`dlx-tms-sandbox-wireframe`). Do **not** deploy it into or modify the
  B.R.A.T. production rating Worker.
- **No secrets in the repo.** The live session cookie is a Worker secret set
  out-of-band.

## Two ways to authenticate

Workers can't run Playwright, so pick one:

- **Login screen (UI credentials) → requires `BACKEND_URL`.** Deploy the Flask
  backend somewhere it can reach the sandbox and run Playwright, set the Worker
  secret `BACKEND_URL` to it, and the Worker proxies the whole `/api/*` surface
  (including `/api/login`, cookies both ways). Users sign in from the browser.
- **Injected session cookie (no backend) → `TMS_SESSION_COOKIE`.** The Worker
  calls the sandbox directly with a pre-captured cookie rotated by
  `refresh_session.py`. **Data-only — there is no login screen in this mode**
  (`/api/login` returns `501`).

For the login screen, use `BACKEND_URL`. Cookie flow across origins is simplest
when the Worker is routed **same-origin** under the Pages domain (`/api/*`); if
the Worker is on its own domain, set `ALLOWED_ORIGIN` to the Pages URL and note
the session cookie must be `SameSite=None; Secure` to survive cross-site.

## Session cookie (cookie-only mode)

For the data-only `TMS_SESSION_COOKIE` mode, rotate the cookie with the
Playwright-based `refresh_session.py`, run from a host that *can* reach the
sandbox and holds the encrypted credentials.

## One-time setup

1. **Cloudflare auth for CI** — add repo secrets:
   - `CLOUDFLARE_API_TOKEN` (scoped to *Workers Scripts: Edit* + *Pages: Edit*)
   - `CLOUDFLARE_ACCOUNT_ID`
2. **Create the Pages project** once (name must match the workflow):
   ```bash
   cd frontend && npm ci && npm run build
   wrangler pages project create dlx-tms-wireframe
   wrangler pages deploy dist --project-name=dlx-tms-wireframe
   ```
3. **Deploy the Worker**:
   ```bash
   cd cloudflare && wrangler deploy
   ```
4. **Wire the API same-origin (recommended)** — so the browser only ever talks
   same-origin. Add a Worker route on the Pages custom domain in
   `cloudflare/wrangler.toml`:
   ```toml
   routes = [{ pattern = "wireframe.example.com/api/*", zone_name = "example.com" }]
   ```
   Then `wrangler deploy` again. (Alternative: leave the Worker on
   `*.workers.dev` and set `ALLOWED_ORIGIN` to the Pages URL + build the
   frontend with `VITE_API_BASE=https://<worker>.workers.dev/api`.)

## Set / rotate the live session cookie

On a host with sandbox egress + encrypted creds (see
`skills/3g-tms-browser/`):

```bash
cd skills/3g-tms-browser
pip install -r requirements.txt && playwright install chromium
python encrypt_credentials.py                 # first time only
python refresh_session.py --wrangler | sh     # sets TMS_SESSION_COOKIE
```

Re-run `refresh_session.py` whenever the cookie expires (the Worker returns
`401 "Sandbox session expired"` when it does). A cron/scheduled task on that
host keeps it fresh.

## Deploy on push

`.github/workflows/deploy.yml` builds the frontend and deploys both Pages and
the Worker on push to `main` (or via *Run workflow*). It does **not** set the
session cookie — that stays out-of-band.

## Verify live

```bash
curl https://<pages-domain>/api/health
#   -> {"ok":true,"mode":"worker-live","host":"shipdlx-sb.3gtms.com"}
curl "https://<pages-domain>/api/loads?savedQueryId=<realSavedQueryId>&page=1"
curl "https://<pages-domain>/api/orders?page=1"
```

Open `https://<pages-domain>/?savedQueryId=<realSavedQueryId>` — the header
badge should read **LIVE SANDBOX** and both columns should fill with real data.
Confirm the Worker/network logs contain **zero** write/action calls.

## Not runnable from the build sandbox

This CI/build environment blocks egress to `shipdlx-sb.3gtms.com` and has no
Cloudflare credentials, so the actual deploy + cookie refresh must run where
those exist. Everything here (Worker, Pages build, workflow, refresh helper) is
verified to build/lint; the live steps are the operator's to run.
