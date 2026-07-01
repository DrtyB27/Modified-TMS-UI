import { StatusBadge, Lane } from './Column.jsx'

function Util({ label, value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="flex-1">
      <div className="mb-0.5 flex justify-between text-[10px] uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-slate-100">
        <div
          className={`h-full rounded ${pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-slate-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function LoadCard({ row }) {
  return (
    <article className="mb-2 rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-slate-800">
          {row.loadNum || '—'}
        </span>
        <StatusBadge status={row.status} />
      </div>
      <div className="mb-2 text-sm">
        <Lane
          from={`${row.originCity || '?'}, ${row.originState || '?'}`}
          to={`${row.destCity || '?'}, ${row.destState || '?'}`}
        />
      </div>
      <div className="mb-2 flex items-center gap-3">
        <Util label="Weight" value={row.wtUtilizationPercent} />
        <Util label="Volume" value={row.volUtilizationPercent} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{row.ordCount ?? 0} order{row.ordCount === 1 ? '' : 's'}</span>
        <span className="truncate pl-2">{row.carrierName || 'No carrier'}</span>
      </div>
    </article>
  )
}
