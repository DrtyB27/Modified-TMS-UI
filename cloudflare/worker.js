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
    const cors = corsHeaders(request, env)

    // CORS preflight (frontend on a Pages domain calling the Worker).
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // Never allow this Worker to be pointed at production.
    if (env.TMS_ORIGIN && env.TMS_ORIGIN.startsWith(PRODUCTION_ORIGIN)) {
      return json({ error: 'This Worker is sandbox-only.' }, 403, cors)
    }
    const origin = env.TMS_ORIGIN || SANDBOX_ORIGIN

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        mode: env.BACKEND_URL ? 'worker->backend' : (env.TMS_SESSION_COOKIE ? 'worker-live' : 'worker-unconfigured'),
        host: new URL(origin).host,
      }, 200, cors)
    }

    // Map the public API onto the read-only 3G endpoints.
    const route = {
      '/api/loads': '/web/loadList/tab0',
      '/api/orders': '/web/orderList',
    }[url.pathname]

    if (!route) return json({ error: 'not found' }, 404, cors)
    if (!isReadOnly(route)) return json({ error: 'read-only violation' }, 403, cors)

    // Preferred: hand off to the Flask backend (which does the Playwright login).
    if (env.BACKEND_URL) {
      const target = new URL(url.pathname + url.search, env.BACKEND_URL)
      const r = await fetch(target, { headers: { accept: 'application/json' } })
      return withCors(r, cors)
    }

    // Live (Cloudflare-native): direct sandbox call using an injected session
    // cookie secret. Refresh the cookie with skills/3g-tms-browser/refresh_session.py.
    if (!env.TMS_SESSION_COOKIE) {
      return json({ error: 'No BACKEND_URL or TMS_SESSION_COOKIE configured.' }, 500, cors)
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
      if (!sq) return json({ error: 'savedQueryId required' }, 400, cors)
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
    // A 3G session that has expired redirects to /login (HTML). Surface that as
    // a clear 401 so the operator knows to refresh TMS_SESSION_COOKIE.
    const text = await resp.text()
    const looksLikeLogin = /<html/i.test(text) && /login/i.test(text)
    if (resp.status >= 400 || looksLikeLogin) {
      return json({
        error: looksLikeLogin
          ? 'Sandbox session expired — refresh TMS_SESSION_COOKIE (refresh_session.py).'
          : `3G returned ${resp.status}`,
      }, looksLikeLogin ? 401 : 502, cors)
    }
    return new Response(text, {
      status: resp.status,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  },
}

// CORS: allow the configured Pages origin (ALLOWED_ORIGIN) or fall back to the
// request Origin. This is our own proxy talking to our own frontend — never 3G.
function corsHeaders(request, env) {
  const reqOrigin = request.headers.get('Origin') || ''
  const allow = env.ALLOWED_ORIGIN || reqOrigin || '*'
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin',
  }
}

function withCors(resp, cors) {
  const h = new Headers(resp.headers)
  for (const [k, v] of Object.entries(cors)) h.set(k, v)
  return new Response(resp.body, { status: resp.status, headers: h })
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  })
}
