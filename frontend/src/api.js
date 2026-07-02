// All 3G access goes through the proxy (Flask in dev, the Cloudflare Worker in
// prod) — the browser never calls 3G directly. Same-origin '/api' by default;
// override with VITE_API_BASE when the Worker lives on a different origin.
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

// credentials:'include' sends the httpOnly session cookie (needed cross-origin).
async function req(path, opts = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, { credentials: 'include', ...opts })
  } catch {
    throw new Error(`Can't reach the API proxy at ${BASE}. Is the backend deployed?`)
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    // A static host (e.g. Pages with no /api backend) returns the SPA HTML here.
    throw new Error(
      `API proxy not connected: ${BASE}${path} returned ${res.status} (${ct || 'no content-type'}). ` +
      `Deploy the backend and route ${BASE} to it.`,
    )
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`)
  return body
}

export function fetchHealth() {
  return req('/health')
}

export function fetchSession() {
  return req('/session')
}

export function login(username, password) {
  return req('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export function logout() {
  return req('/logout', { method: 'POST' })
}

export function fetchLoads({ savedQueryId = '', page = 1 } = {}) {
  const q = new URLSearchParams({ savedQueryId, page: String(page) })
  return req(`/loads?${q}`)
}

export function fetchOrders({ page = 1 } = {}) {
  const q = new URLSearchParams({ page: String(page) })
  return req(`/orders?${q}`)
}

// Normalize the various row wrappers 3G grids use into a plain array.
export function rowsOf(payload) {
  if (!payload) return []
  for (const k of ['Rows', 'rows', 'records', 'data']) {
    if (Array.isArray(payload[k])) return payload[k]
  }
  return Array.isArray(payload) ? payload : []
}
