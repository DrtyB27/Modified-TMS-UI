// All 3G access goes through the proxy (Flask in dev, the Cloudflare Worker in
// prod) — the browser never calls 3G directly. Same-origin '/api' by default;
// override with VITE_API_BASE when the Worker lives on a different origin.
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export function fetchHealth() {
  return getJson('/health')
}

export function fetchLoads({ savedQueryId = '', page = 1 } = {}) {
  const q = new URLSearchParams({ savedQueryId, page: String(page) })
  return getJson(`/loads?${q}`)
}

export function fetchOrders({ page = 1 } = {}) {
  const q = new URLSearchParams({ page: String(page) })
  return getJson(`/orders?${q}`)
}

// Normalize the various row wrappers 3G grids use into a plain array.
export function rowsOf(payload) {
  if (!payload) return []
  for (const k of ['Rows', 'rows', 'records', 'data']) {
    if (Array.isArray(payload[k])) return payload[k]
  }
  return Array.isArray(payload) ? payload : []
}
