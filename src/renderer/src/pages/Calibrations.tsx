import { memo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useRows } from '@/lib/useRows'
import { ClipboardCheck } from 'lucide-react'
import { Card, EmptyState, PageHeader, SearchInput, td, th, cx } from '@/components/ui'
import { ResultBadge } from '@/components/DueBadge'
import { fmtDate } from '@/lib/format'
import { equipmentLabel } from '@/lib/sheets'

interface Row { id: string; certificate_number: string | null; performed_at: string; status: string; result: string | null; equipment_type: string; model: string | null; technician_name: string | null; description: string; serial_number: string | null; customer_name: string }

export function Calibrations() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [q, setQ] = useState('')
  const like = `%${q.trim()}%`
  const { data, isLoading } = useRows<Row>(
    `SELECT k.id, k.certificate_number, k.performed_at, k.status, k.result, k.technician_name,
            e.equipment_type, e.model, e.description, e.serial_number, c.name AS customer_name
     FROM calibrations k JOIN equipment e ON e.id = k.equipment_id JOIN customers c ON c.id = k.customer_id
     WHERE (? = '' OR k.status = ?)
       AND (k.certificate_number LIKE ? OR e.model LIKE ? OR e.serial_number LIKE ? OR c.name LIKE ? OR k.technician_name LIKE ?)
     ORDER BY k.performed_at DESC, k.created_at DESC LIMIT 500`,
    [status, status, like, like, like, like, like]
  )
  return (
    <>
      <PageHeader title="Calibrations" subtitle="Calibrations are started from a visit" />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search certificate, equipment, customer…" className="max-w-sm" />
          <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5">
            {[['', 'All'], ['draft', 'Drafts'], ['completed', 'Completed']].map(([k, label]) => (
              <button key={k} onClick={() => setParams(k ? { status: k } : {})} className={cx('rounded-md px-3 py-1.5 text-xs font-medium', status === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900')}>{label}</button>
            ))}
          </div>
        </div>
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={20} />} title="No calibrations found" />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Date</th><th className={th}>Certificate</th><th className={th}>Equipment</th><th className={th}>Technician</th><th className={th}>Result</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((k) => <CalibrationRow key={k.id} k={k} />)}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}

/** Memoized: re-renders only when this row's data changes. */
const CalibrationRow = memo(function CalibrationRow({ k }: { k: Row }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/calibrations/${k.id}`)}>
      <td className={`${td} whitespace-nowrap`}>{fmtDate(k.performed_at)}</td>
      <td className={`${td} font-mono text-xs`}><Link to={`/calibrations/${k.id}`} className="text-slate-700">{k.certificate_number}</Link></td>
      <td className={td}><div className="font-medium text-slate-800">{equipmentLabel(k)}</div><div className="text-xs text-slate-500">{k.customer_name}{k.serial_number ? ` · S/N ${k.serial_number}` : ''}</div></td>
      <td className={`${td} text-slate-600`}>{k.technician_name || '—'}</td>
      {k.status === 'draft' ? (
        <td className={td}><span className="text-xs font-medium text-sky-700">Draft</span></td>
      ) : (
        <td className={td}><ResultBadge result={k.result} /></td>
      )}
    </tr>
  )
})
