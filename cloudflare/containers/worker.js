/**
 * Container-router Worker for the DLX 3G sandbox backend (Cloudflare Containers).
 *
 * This is the /api proxy for the LOGIN-SCREEN deployment: it forwards the whole
 * /api/* surface to the Flask + Playwright backend running as a Cloudflare
 * Container (see ../../Dockerfile). The container does the 3G sandbox login and
 * holds the session; the browser only ever talks to this Worker.
 *
 * ⚠️  SEPARATE, sandbox-only deployment. Do NOT merge into the B.R.A.T.
 *     production Worker. The container talks to shipdlx-sb.3gtms.com only
 *     (enforced in the Python client's read-only + sandbox guards).
 *
 * Read-only is enforced end-to-end in the Python client; the allow-list here is
 * defense-in-depth at the edge.
 */

import { Container, getContainer } from '@cloudflare/containers'

export class Backend extends Container {
  defaultPort = 8080
  sleepAfter = '15m' // idle -> sleep; next login pays a Chromium cold start
  envVars = {
    USE_FIXTURES: '0',
    LOGIN_REQUIRED: '1',
    FORCE_SECURE_COOKIE: '1',
    // If the frontend (Pages) is a different origin than this Worker, set this
    // to the exact Pages URL so credentialed CORS works. Same-origin route -> unset.
    // FRONTEND_ORIGIN: 'https://dlx-tms-wireframe.pages.dev',
  }
}

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      })
    }
    if (!apiPathAllowed(url.pathname)) {
      return new Response(JSON.stringify({ error: 'read-only violation' }), {
        status: 403, headers: { 'content-type': 'application/json' },
      })
    }
    // Single, sticky instance so the in-memory session store is consistent.
    const container = getContainer(env.BACKEND, 'singleton')
    return container.fetch(request)
  },
}
