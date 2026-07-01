import { StatusBadge, Lane } from './Column.jsx'

export function OrderCard({ row }) {
  const wt = row.totalWeight != null ? `${Number(row.totalWeight).toLocaleString()} ${row.weightUom || ''}`.trim() : '—'
  const vol = row.totalVolume != null ? `${Number(row.totalVolume).toLocaleString()} ${row.volumeUom || ''}`.trim() : '—'
  return (
    <article className="mb-2 rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-slate-800">
          {row.orderNum || '—'}
        </span>
        <StatusBadge status={row.status} />
      </div>
      <div className="mb-1 text-sm">
        <Lane
          from={`${row.originCity || '?'}, ${row.originState || '?'}`}
          to={`${row.destCity || '?'}, ${row.destState || '?'}`}
        />
      </div>
      <div className="mb-2 text-xs text-slate-500">{row.customerName || 'Unknown customer'}</div>
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
        <div><span className="text-slate-400">Wt</span> {wt}</div>
        <div><span className="text-slate-400">Vol</span> {vol}</div>
        <div><span className="text-slate-400">Pcs</span> {row.pieceCount ?? '—'}</div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">Ship {row.requestedShipDate || '—'}</span>
        <span className={row.loadNum ? 'text-blue-700' : 'text-slate-400'}>
          {row.loadNum ? `on ${row.loadNum}` : 'unassigned'}
        </span>
      </div>
    </article>
  )
}
