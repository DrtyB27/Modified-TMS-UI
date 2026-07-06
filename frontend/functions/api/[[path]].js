/**
 * Cloudflare Pages Function: same-origin /api proxy.
 *
 * Runs on the Pages domain (e.g. modified-tms-ui.pages.dev), so the browser
 * only ever talks first-party — the session cookie stays first-party and works
 * in Safari/Chrome without third-party-cookie exemptions. This forwards /api/*
 * to the backend container Worker server-side.
 *
 * Reaching the backend Worker — two ways, in priority order:
 *   1. Service binding `BACKEND` (preferred): add a Pages Functions service
 *      binding named BACKEND -> the dlx-tms-sandbox-backend Worker. This calls
 *      the Worker directly over Cloudflare's internal network — no public URL,
 *      works even when the account's workers.dev routing is broken.
 *   2. Public URL fallback: set env var
 *      BACKEND_ORIGIN = https://dlx-tms-sandbox-backend.<account>.workers.dev
 *
 * Read-only allow-list here is defense-in-depth; the Python client is the real
 * guard. Sandbox-only is enforced downstream too.
 */

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
  if (FORBIDDEN_TOKENS.some((t) => clean.toLowerCase().includes(t))) return false
  return ALLOWED_API.has(clean)
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)

  if (!apiPathAllowed(url.pathname)) {
    return json({ error: 'read-only violation' }, 403)
  }

  // 1. Preferred: service binding — call the Worker directly (no public URL).
  if (env.BACKEND && typeof env.BACKEND.fetch === 'function') {
    const resp = await env.BACKEND.fetch(request)
    return new Response(resp.body, { status: resp.status, headers: resp.headers })
  }

  // 2. Fallback: public URL via BACKEND_ORIGIN.
  const backend = env.BACKEND_ORIGIN
  if (!backend) {
    return json({
      error: 'No backend configured: add a `BACKEND` service binding (preferred) '
        + 'or set BACKEND_ORIGIN on the Pages project.',
    }, 500)
  }

  const target = backend.replace(/\/$/, '') + url.pathname + url.search
  const headers = new Headers(request.headers)
  headers.delete('host') // let fetch set the backend host
  headers.set('accept', 'application/json')

  const resp = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  })
  // Return as-is: Set-Cookie has no Domain attribute (Flask sets it host-less),
  // so the browser scopes it to the Pages origin — first-party.
  return new Response(resp.body, { status: resp.status, headers: resp.headers })
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
