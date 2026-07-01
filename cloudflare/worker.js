/**
 * SEPARATE, NEW Cloudflare Worker for the DLX 3G sandbox wireframe.
 *
 * ⚠️  ISOLATION REQUIREMENT
 * Do NOT deploy this into — or otherwise modify — the Worker that currently
 * serves B.R.A.T.'s PRODUCTION rating/quoting traffic. This wireframe's
 * sandbox-pointed traffic must stay physically isolated from any tool people
 * rely on for live quoting. Deploy this as its own Worker (its own name, route,
 * and secrets). It is fine that the session-auth handling below was *seeded*
 * from the B.R.A.T. Worker — but this is a copy, on its own deployment.
 *
 * HARD RULES
 *  - Sandbox host ONLY: shipdlx-sb.3gtms.com. Never production.
 *  - Read-only: only the loadList / orderList endpoints are proxied; any path
 *    containing a write verb is rejected.
 *
 * This is a starting-point skeleton. In practice the heavy lifting (Playwright
 * login) can't run in a Worker; the Worker either (a) proxies to the Flask
 * backend, or (b) reuses a session cookie injected as a secret. Both paths are
 * sketched below. Secrets (TMS_SESSION_COOKIE / BACKEND_URL) are set via
 * `wrangler secret put` — never hard-coded.
 */

const SANDBOX_ORIGIN = 'https://shipdlx-sb.3gtms.com'
const PRODUCTION_ORIGIN = 'https://shipdlx.3gtms.com' // for the guard only

const ALLOWED_3G_PATHS = new Set(['/web/loadList/tab0', '/web/orderList'])
const FORBIDDEN_TOKENS = [
  'save', 'create', 'plan', 'unplan', 'assign', 'delete', 'remove',
  'cancel', 'send', 'update', 'add', 'commit', 'tender', 'book',
]

function isReadOnly(path) {
  const lower = path.toLowerCase()
  if (FORBIDDEN_TOKENS.some((t) => lower.includes(t))) return false
  return ALLOWED_3G_PATHS.has(path.replace(/\/$/, ''))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Never allow this Worker to be pointed at production.
    if (env.TMS_ORIGIN && env.TMS_ORIGIN.startsWith(PRODUCTION_ORIGIN)) {
      return json({ error: 'This Worker is sandbox-only.' }, 403)
    }
    const origin = env.TMS_ORIGIN || SANDBOX_ORIGIN

    if (url.pathname === '/api/health') {
      return json({ ok: true, mode: 'worker', host: new URL(origin).host })
    }

    // Map the public API onto the read-only 3G endpoints.
    const route = {
      '/api/loads': '/web/loadList/tab0',
      '/api/orders': '/web/orderList',
    }[url.pathname]

    if (!route) return json({ error: 'not found' }, 404)
    if (!isReadOnly(route)) return json({ error: 'read-only violation' }, 403)

    // Preferred: hand off to the Flask backend (which does the Playwright login).
    if (env.BACKEND_URL) {
      const target = new URL(url.pathname + url.search, env.BACKEND_URL)
      return fetch(target, { headers: { accept: 'application/json' } })
    }

    // Alt: direct sandbox call using an injected session cookie secret.
    if (!env.TMS_SESSION_COOKIE) {
      return json({ error: 'No BACKEND_URL or TMS_SESSION_COOKIE configured.' }, 500)
    }
    const page = url.searchParams.get('page') || '1'
    const pageSize = url.searchParams.get('pageSize') || '50'
    const start = (Number(page) - 1) * Number(pageSize)
    const body = new URLSearchParams({
      filterscount: '0', groupscount: '0',
      pagenum: page, pagesize: pageSize,
      recordstartindex: String(start),
      recordendindex: String(start + Number(pageSize)),
    })
    if (route === '/web/loadList/tab0') {
      const sq = url.searchParams.get('savedQueryId')
      if (!sq) return json({ error: 'savedQueryId required' }, 400)
      body.set('savedQueryId', sq)
    }

    const resp = await fetch(origin + route, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-requested-with': 'XMLHttpRequest',
        cookie: env.TMS_SESSION_COOKIE,
      },
      body,
    })
    const text = await resp.text()
    return new Response(text, {
      status: resp.status,
      headers: { 'content-type': 'application/json' },
    })
  },
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
