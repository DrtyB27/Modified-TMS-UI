/**
 * SEPARATE, NEW Cloudflare Worker for the DLX 3G sandbox wireframe.
 *
 * ⚠️  ISOLATION REQUIREMENT
 * Do NOT deploy this into — or otherwise modify — the Worker that currently
 * serves B.R.A.T.'s PRODUCTION rating/quoting traffic. This wireframe's
 * sandbox-pointed traffic must stay physically isolated from any tool people
 * rely on for live quoting. Deploy this as its own Worker (its own name, route,
 * and secrets).
 *
 * HARD RULES
 *  - Sandbox host ONLY: shipdlx-sb.3gtms.com. Never production.
 *  - Read-only: only the loadList / orderList data endpoints reach 3G; any path
 *    containing a write verb is rejected.
 *
 * TWO MODES
 *  1. BACKEND_URL set (required for the LOGIN SCREEN): proxy the whole /api/*
 *     surface to the Flask backend, which does the Playwright login and holds
 *     the session. Method, body, and cookies are forwarded both ways. This is
 *     the mode to use when the UI collects credentials.
 *  2. TMS_SESSION_COOKIE set (no backend): the Worker calls the sandbox directly
 *     with an injected session cookie. Data-only — it CANNOT do UI login, so
 *     /api/login returns 501 here.
 *
 * Secrets (via `wrangler secret put`, never committed):
 *   BACKEND_URL          URL of the Flask proxy (enables login)
 *   TMS_SESSION_COOKIE   alt: injected sandbox session cookie (data-only)
 */

const SANDBOX_ORIGIN = 'https://shipdlx-sb.3gtms.com'
const PRODUCTION_ORIGIN = 'https://shipdlx.3gtms.com' // for the guard only

// Public API surface the Worker will forward to a backend.
const ALLOWED_API = new Set([
  '/api/health', '/api/session', '/api/login', '/api/logout',
  '/api/loads', '/api/orders',
])
const FORBIDDEN_TOKENS = [
  'save', 'create', 'plan', 'unplan', 'assign', 'delete', 'remove',
  'cancel', 'send', 'update', 'commit', 'tender', 'book',
]

function apiPathAllowed(path) {
  const clean = path.replace(/\/$/, '')
  const lower = clean.toLowerCase()
  if (FORBIDDEN_TOKENS.some((t) => lower.includes(t))) return false
  return ALLOWED_API.has(clean)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // Never allow this Worker to be pointed at production.
    if (env.TMS_ORIGIN && env.TMS_ORIGIN.startsWith(PRODUCTION_ORIGIN)) {
      return json({ error: 'This Worker is sandbox-only.' }, 403, cors)
    }
    const origin = env.TMS_ORIGIN || SANDBOX_ORIGIN

    if (!url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404, cors)
    }
    if (!apiPathAllowed(url.pathname)) {
      return json({ error: 'read-only violation' }, 403, cors)
    }

    // Mode 1: hand the whole /api surface to the Playwright-capable backend.
    if (env.BACKEND_URL) {
      const target = new URL(url.pathname + url.search, env.BACKEND_URL)
      const backendResp = await fetch(target, {
        method: request.method,
        headers: forwardHeaders(request),
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      })
      return withCors(backendResp, cors) // preserves Set-Cookie from the backend
    }

    // Health works without a backend (reports how the Worker is configured).
    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        mode: env.TMS_SESSION_COOKIE ? 'worker-live' : 'worker-unconfigured',
        host: new URL(origin).host,
      }, 200, cors)
    }

    // Mode 2 (cookie-only) has no login capability.
    if (url.pathname === '/api/login' || url.pathname === '/api/logout' || url.pathname === '/api/session') {
      if (url.pathname === '/api/session') {
        return json({ authenticated: !!env.TMS_SESSION_COOKIE, mode: 'worker-live', loginRequired: false }, 200, cors)
      }
      return json({
        error: 'Login requires BACKEND_URL (a Playwright-capable backend). This Worker is in cookie-only mode.',
      }, 501, cors)
    }

    // Mode 2: direct sandbox data call with the injected session cookie.
    if (!env.TMS_SESSION_COOKIE) {
      return json({ error: 'No BACKEND_URL or TMS_SESSION_COOKIE configured.' }, 500, cors)
    }
    const route = { '/api/loads': '/web/loadList/tab0', '/api/orders': '/web/orderList' }[url.pathname]
    if (!route) return json({ error: 'not found' }, 404, cors)

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

// Forward the client's method/body context to the backend: cookies (session),
// content-type, and accept. Drop hop-by-hop / host headers.
function forwardHeaders(request) {
  const h = new Headers()
  const cookie = request.headers.get('cookie')
  const ct = request.headers.get('content-type')
  if (cookie) h.set('cookie', cookie)
  if (ct) h.set('content-type', ct)
  h.set('accept', 'application/json')
  return h
}

// CORS: allow the configured Pages origin (ALLOWED_ORIGIN) or reflect the
// request Origin. Credentials are allowed so the session cookie flows. This is
// our own proxy talking to our own frontend — never 3G.
function corsHeaders(request, env) {
  const reqOrigin = request.headers.get('Origin') || ''
  const allow = env.ALLOWED_ORIGIN || reqOrigin || '*'
  const headers = {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin',
  }
  // Credentialed CORS requires a specific origin (not '*').
  if (allow !== '*') headers['access-control-allow-credentials'] = 'true'
  return headers
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
