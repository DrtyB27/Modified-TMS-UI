import { useEffect, useState } from 'react'
import { fetchSession, fetchLoads, fetchOrders, logout, rowsOf } from './api.js'
import { Column } from './components/Column.jsx'
import { LoadCard } from './components/LoadCard.jsx'
import { OrderCard } from './components/OrderCard.jsx'
import { Login } from './components/Login.jsx'

// Saved query that scopes the Loads grid. Swap for a real sandbox savedQueryId
// when running live; ignored in fixtures mode.
const SAVED_QUERY_ID = new URLSearchParams(location.search).get('savedQueryId') || 'demo'

export default function App() {
  const [session, setSession] = useState(null) // {authenticated, mode, loginRequired, user}
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    fetchSession()
      .then(setSession)
      .catch(() => setSession({ authenticated: false, mode: 'unknown', loginRequired: true }))
      .finally(() => setBooting(false))
  }, [])

  if (booting) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>
  }

  const needsLogin = session.loginRequired && !session.authenticated
  if (needsLogin) {
    return <Login mode={session.mode} onLoggedIn={(r) => setSession({ ...session, authenticated: true, user: r.user })} />
  }

  return <Dashboard session={session} onLogout={() => setSession({ ...session, authenticated: false, user: null })} />
}

function Dashboard({ session, onLogout }) {
  const [loads, setLoads] = useState([])
  const [orders, setOrders] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [l, o] = await Promise.all([
          fetchLoads({ savedQueryId: SAVED_QUERY_ID }),
          fetchOrders({}),
        ])
        if (!alive) return
        setLoads(rowsOf(l))
        setOrders(rowsOf(o))
      } catch (e) {
        if (alive) setError(e.message)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  async function doLogout() {
    try { await logout() } catch { /* ignore */ }
    onLogout()
  }

  const live = session.mode === 'live'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">DLX × 3G TMS — Sandbox Wireframe</h1>
            <p className="text-xs text-slate-500">
              Read-only proof-of-concept. Loads &amp; Orders from{' '}
              <span className="font-mono">shipdlx-sb.3gtms.com</span>.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                live ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
              title={live ? 'Live sandbox data.' : 'Serving local fixtures (offline).'}
            >
              {live ? 'LIVE SANDBOX' : 'FIXTURES (offline)'}
            </span>
            {session.user && (
              <span className="text-xs text-slate-500">{session.user}</span>
            )}
            {session.loginRequired && (
              <button
                onClick={doLogout}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {!loading && (
          <div className="flex flex-col gap-4 md:flex-row">
            <Column title="Loads" count={loads.length}>
              {loads.map((row, i) => <LoadCard key={row.loadNum || i} row={row} />)}
              {loads.length === 0 && <Empty label="No loads" />}
            </Column>
            <Column title="Orders" count={orders.length}>
              {orders.map((row, i) => <OrderCard key={row.orderNum || i} row={row} />)}
              {orders.length === 0 && <Empty label="No orders" />}
            </Column>
          </div>
        )}
      </main>
    </div>
  )
}

function Empty({ label }) {
  return <p className="px-2 py-8 text-center text-sm text-slate-400">{label}</p>
}
