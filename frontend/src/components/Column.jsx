export function Column({ title, count, children }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          {title}
        </h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {count}
        </span>
      </header>
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </section>
  )
}

export function StatusBadge({ status }) {
  const tone = {
    Open: 'bg-slate-100 text-slate-700',
    Available: 'bg-emerald-100 text-emerald-800',
    Planned: 'bg-blue-100 text-blue-800',
    Tendered: 'bg-amber-100 text-amber-800',
    'In Transit': 'bg-indigo-100 text-indigo-800',
    Delivered: 'bg-green-100 text-green-800',
    'On Hold': 'bg-rose-100 text-rose-800',
  }[status] || 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status || '—'}
    </span>
  )
}

export function Lane({ from, to }) {
  return (
    <span className="text-slate-600">
      {from} <span className="text-slate-400">→</span> {to}
    </span>
  )
}
