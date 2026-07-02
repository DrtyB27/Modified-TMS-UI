import { useState } from 'react'
import { login } from '../api.js'

export function Login({ mode, onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await login(username, password)
      onLoggedIn(r)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">DLX × 3G TMS</h1>
          <p className="text-xs text-slate-500">
            Sandbox wireframe · read-only ·{' '}
            <span className="font-mono">shipdlx-sb.3gtms.com</span>
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Sign in
          </h2>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
          </label>

          {error && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          {mode === 'fixtures' && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Demo mode: no live 3G call — any username/password signs in and
              shows sample data.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Credentials are sent to your own read-only proxy, used once to open a
            sandbox session, and never stored. The browser keeps only a session
            cookie.
          </p>
        </form>
      </div>
    </div>
  )
}
