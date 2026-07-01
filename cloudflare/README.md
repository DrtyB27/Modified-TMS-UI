# Cloudflare Worker (sandbox wireframe) — optional

A **separate, new** Worker for this POC. **Never** deploy into or modify the
Worker serving B.R.A.T.'s production rating traffic — sandbox traffic stays
physically isolated.

- Sandbox host only (`shipdlx-sb.3gtms.com`); the Worker refuses production.
- Read-only: only `loadList` / `orderList` are proxied; write verbs are rejected.

## Deploy

```bash
npm i -g wrangler
# Preferred: proxy to the Flask backend that performs the Playwright login.
wrangler secret put BACKEND_URL          # https://<your-flask-host>
# Alt: direct sandbox calls with an injected session cookie.
wrangler secret put TMS_SESSION_COOKIE
wrangler deploy
```

The auth handling here was **seeded from** the B.R.A.T. Worker but is its own
deployment. For local dev you usually don't need this Worker at all — the Vite
dev server proxies `/api` straight to Flask.

## Live mode (Cloudflare-native)

The Worker can't run Playwright, so live data uses an injected
`TMS_SESSION_COOKIE` secret, rotated by
`../skills/3g-tms-browser/refresh_session.py`. It refuses production, enforces
read-only, and returns `401` when the session expires (time to re-run the
refresh helper). Full runbook: **[`../DEPLOY.md`](../DEPLOY.md)**.
