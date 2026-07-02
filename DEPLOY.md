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

- **Login screen (UI credentials).** Users sign in from the browser; a
  Playwright-capable backend does the 3G login. Host that backend on **Cloudflare
  Containers** (recommended — all-Cloudflare, see below) or anywhere it can reach
  the sandbox, then front it with a Worker. The `cloudflare/worker.js`
  `BACKEND_URL` mode proxies `/api/*` to an off-Cloudflare backend; the
  `cloudflare/containers/` deployment bundles the backend as a container.
- **Injected session cookie (no backend) → `TMS_SESSION_COOKIE`.** The Worker
  calls the sandbox directly with a pre-captured cookie rotated by
  `refresh_session.py`. **Data-only — there is no login screen in this mode**
  (`/api/login` returns `501`).

For the login screen, use `BACKEND_URL`. Cookie flow across origins is simplest
when the Worker is routed **same-origin** under the Pages domain (`/api/*`); if
the Worker is on its own domain, set `ALLOWED_ORIGIN` to the Pages URL and note
the session cookie must be `SameSite=None; Secure` to survive cross-site.

## Connecting Pages (`*.pages.dev`) to the backend — same-origin proxy

You can't attach a Worker route to a `*.pages.dev` domain, and calling the
backend Worker cross-origin uses a **third-party cookie** (blocked by Safari and
increasingly Chrome — the login won't stick). The fix, with no custom domain, is
the bundled **Pages Function** at `frontend/functions/api/[[path]].js`: it runs
on the Pages origin and forwards `/api/*` to the backend Worker server-side, so
the session cookie stays first-party.

Setup:
1. Deploy the backend container (below) → note its
   `https://dlx-tms-sandbox-backend.<account>.workers.dev` URL.
2. In the Pages project → Settings → Environment variables, set
   `BACKEND_ORIGIN = https://dlx-tms-sandbox-backend.<account>.workers.dev`
   and **Retry deployment**.
3. Leave `VITE_API_BASE` unset (defaults to same-origin `/api`). No CORS or
   `SameSite=None` needed — it's all first-party.

(If you later add a custom domain, you can drop the Function and route the Worker
at `yourdomain/api/*` instead.)

## Host the backend on Cloudflare Containers (recommended for the login screen)

Runs the Flask + Playwright backend as a Cloudflare Container behind a router
Worker — all on Cloudflare, no separate VM. Needs Docker locally (or a CI runner
with Docker) + `wrangler login`.

```bash
cd cloudflare/containers
npm install
npm run deploy     # builds ../../Dockerfile, pushes image, deploys Worker+Container
curl https://<worker-domain>/api/health   # -> {"mode":"live",...}
```

Then front it: route this Worker **same-origin** under the Pages domain
(`/api/*`, recommended so the session cookie is first-party), or set
`VITE_API_BASE` to the Worker URL and `FRONTEND_ORIGIN` (in the `Backend` class
`envVars`) to the Pages URL. No secrets — credentials come from the login form.
Details: `cloudflare/containers/README.md`. Notes: single instance keeps
in-memory sessions consistent; Chromium wants a `standard` instance; the first
login after idle pays a cold start.

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
