# Cloudflare Containers — backend (login screen)

Runs the Flask + Playwright backend as a **Cloudflare Container**, fronted by a
small router Worker. This is the deployment that powers the **login screen**: the
container does the 3G sandbox login and holds the session; the browser only talks
to the Worker.

- **Sandbox only, read-only** — enforced in the Python client.
- **Separate deployment** — never the B.R.A.T. production Worker.
- **No secrets** — credentials arrive at runtime via the login form; only a
  session (in memory) and the browser's `httpOnly` cookie are kept.

## Deploy

Requires Docker locally (or a CI runner with Docker) + `wrangler login`.

```bash
cd cloudflare/containers
npm install
npm run deploy          # builds ../../Dockerfile, pushes image, deploys Worker+Container
```

Then point the frontend at this Worker — either route it **same-origin** under
the Pages domain (`/api/*`, recommended) or build the frontend with
`VITE_API_BASE=https://dlx-tms-sandbox-backend.<account>.workers.dev/api` and set
`FRONTEND_ORIGIN` (in the `Backend` class `envVars`) to the Pages URL.

## Verify

```bash
curl https://<worker-or-pages-domain>/api/health     # {"mode":"live",...}
```

Open the site → sign in with sandbox credentials → **LIVE SANDBOX** badge, both
columns populate.

## Notes

- **Single instance** (`max_instances = 1`) keeps the in-memory session store
  consistent. For multi-instance you'd move sessions to a shared store (KV/DO).
- **Cold start**: after `sleepAfter` idle, the next login pays a Chromium launch
  (a few seconds).
- **Instance size**: Chromium needs memory — `instance_type = "standard"`. Check
  `wrangler containers` for the sizes on your account.
