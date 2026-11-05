import { memo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { Badge, Card, EmptyState, PageHeader, SearchInput, cx, td, th } from '@/components/ui'
import { NewVisitButton } from '@/components/NewVisit'
import { fmtDate } from '@/lib/format'

interface Row { id: string; visit_date: string; location: string | null; status: string; technician_name: string | null; customer_name: string; cal_count: number; draft_count: number }

export function Visits() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [q, setQ] = useState('')
  const like = `%${q.trim()}%`
  const { data, isLoading } = useRows<Row>(
    `SELECT v.id, v.visit_date, v.location, v.status, v.technician_name, c.name AS customer_name,
       (SELECT count(*) FROM calibrations k WHERE k.visit_id = v.id) AS cal_count,
       (SELECT count(*) FROM calibrations k WHERE k.visit_id = v.id AND k.status = 'draft') AS draft_count
     FROM visits v JOIN customers c ON c.id = v.customer_id
     WHERE (? = '' OR v.status = ?) AND (c.name LIKE ? OR v.location LIKE ? OR v.technician_name LIKE ?)
     ORDER BY v.visit_date DESC, v.created_at DESC LIMIT 500`,
    [status, status, like, like, like]
  )
  return (
    <>
      <PageHeader title="Visits" subtitle="Each visit groups the calibrations done for a customer" actions={<NewVisitButton />} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, location, technician…" className="max-w-sm" />
          <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5">
            {[['', 'All'], ['open', 'Open'], ['completed', 'Completed']].map(([k, label]) => (
              <button key={k} onClick={() => setParams(k ? { status: k } : {})} className={cx('rounded-md px-3 py-1.5 text-xs font-medium', status === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900')}>{label}</button>
            ))}
          </div>
        </div>
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<CalendarCheck size={20} />} title={q || status ? 'No visits found' : 'No visits yet'} action={!q && !status && <NewVisitButton />}>
            Start a visit, pick the customer, then calibrate their equipment.
          </EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Date</th><th className={th}>Customer</th><th className={th}>Location</th><th className={th}>Calibrations</th><th className={th}>Technician</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.map((v) => <VisitRow key={v.id} v={v} />)}</tbody>
          </table>
        )}
      </Card>
    </>
  )
}

/** Memoized: re-renders only when this visit's row data changes. */
const VisitRow = memo(function VisitRow({ v }: { v: Row }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/visits/${v.id}`)}>
      <td className={`${td} whitespace-nowrap`}><Link to={`/visits/${v.id}`} className="font-medium text-slate-800">{fmtDate(v.visit_date)}</Link></td>
      <td className={`${td} text-slate-700`}>{v.customer_name}</td>
      <td className={`${td} text-slate-600`}>{v.location || '—'}</td>
      <td className={`${td} text-slate-600`}>{v.cal_count}{v.draft_count > 0 && <span className="ml-2 text-xs text-sky-700">{v.draft_count} in progress</span>}</td>
      <td className={`${td} text-slate-600`}>{v.technician_name || '—'}</td>
      <td className={td}>{v.status === 'completed' ? <Badge tone="green">Completed</Badge> : <Badge tone="blue">Open</Badge>}</td>
    </tr>
  )
})
