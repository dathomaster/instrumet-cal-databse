import { memo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useRows } from '@/lib/useRows'
import { Plus, Wrench } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, SearchInput, Select, td, th, cx } from '@/components/ui'
import { DueBadge } from '@/components/DueBadge'
import { EquipmentForm } from '@/components/forms'
import { addDays, DUE_SOON_DAYS, joinNonEmpty, todayISO } from '@/lib/format'

interface Row { id: string; description: string; asset_tag: string | null; manufacturer: string | null; model: string | null; serial_number: string | null; next_due_at: string | null; status: string; customer_name: string; customer_id: string; equipment_type: string | null }

const filters = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'soon', label: `Due ≤ ${DUE_SOON_DAYS}d` },
  { key: 'none', label: 'Never calibrated' }
]

export function EquipmentList() {
  const [params, setParams] = useSearchParams()
  const due = params.get('due') ?? 'all'
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [adding, setAdding] = useState(false)
  const nav = useNavigate()
  const today = todayISO()
  const like = `%${q.trim()}%`

  const dueSql =
    due === 'overdue' ? `AND substr(e.next_due_at,1,10) < '${today}'`
    : due === 'soon' ? `AND substr(e.next_due_at,1,10) BETWEEN '${today}' AND '${addDays(today, DUE_SOON_DAYS)}'`
    : due === 'none' ? 'AND e.next_due_at IS NULL'
    : ''

  const { data, isLoading } = useRows<Row>(
    `SELECT e.id, e.description, e.asset_tag, e.manufacturer, e.model, e.serial_number, e.next_due_at, e.status, e.equipment_type,
            c.name AS customer_name, c.id AS customer_id
     FROM equipment e JOIN customers c ON c.id = e.customer_id
     WHERE (e.description LIKE ? OR e.serial_number LIKE ? OR e.asset_tag LIKE ? OR e.model LIKE ? OR e.manufacturer LIKE ? OR c.name LIKE ?)
       AND (? = '' OR e.equipment_type = ?)
       ${due !== 'all' ? "AND e.status = 'active'" : ''} ${dueSql}
     ORDER BY e.next_due_at IS NULL, e.next_due_at, e.description COLLATE NOCASE`,
    [like, like, like, like, like, like, type, type]
  )
  const { data: types } = useRows<{ t: string }>("SELECT DISTINCT equipment_type AS t FROM equipment WHERE equipment_type IS NOT NULL AND equipment_type != '' ORDER BY 1")

  return (
    <>
      <PageHeader title="Equipment" subtitle={`${data.length} item${data.length === 1 ? '' : 's'}`} actions={<Button onClick={() => setAdding(true)}><Plus size={16} />Add equipment</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, serial, tag, customer…" className="max-w-sm" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-44">
            <option value="">All types</option>
            {types.map((t) => <option key={t.t} value={t.t}>{t.t}</option>)}
          </Select>
          <div className="ml-auto flex rounded-lg bg-slate-100 p-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setParams(f.key === 'all' ? {} : { due: f.key })}
                className={cx('rounded-md px-3 py-1.5 text-xs font-medium', due === f.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<Wrench size={20} />} title="No equipment found">{q || due !== 'all' ? 'Try changing the search or filter.' : 'Add equipment from a customer page or with the button above.'}</EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Description</th><th className={th}>Customer</th><th className={th}>Make / model</th><th className={th}>Serial</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((e) => <EquipmentRow key={e.id} e={e} />)}
            </tbody>
          </table>
        )}
      </Card>
      <EquipmentForm open={adding} onClose={() => setAdding(false)} onCreated={(id) => nav(`/equipment/${id}`)} />
    </>
  )
}

/** Memoized: re-renders only when this row's data changes. */
const EquipmentRow = memo(function EquipmentRow({ e }: { e: Row }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/equipment/${e.id}`)}>
      <td className={td}>
        <Link to={`/equipment/${e.id}`} className="font-medium text-slate-800">{e.description}</Link>
        <div className="text-xs text-slate-500">{joinNonEmpty([e.equipment_type, e.asset_tag && `Tag ${e.asset_tag}`], ' · ')}</div>
      </td>
      <td className={`${td} text-slate-600`}>{e.customer_name}</td>
      <td className={`${td} text-slate-600`}>{joinNonEmpty([e.manufacturer, e.model], ' ') || '—'}</td>
      <td className={`${td} font-mono text-xs text-slate-600`}>{e.serial_number || '—'}</td>
      <td className={td}>{e.status === 'active' ? <DueBadge date={e.next_due_at} /> : <span className="text-xs capitalize text-slate-500">{e.status.replace(/_/g, ' ')}</span>}</td>
    </tr>
  )
})
