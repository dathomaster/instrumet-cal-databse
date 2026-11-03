import { useState } from 'react'
import { useQuery } from '@powersync/react'
import { Pencil, Plus, Ruler } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, SearchInput, td, th } from '@/components/ui'
import { DueBadge } from '@/components/DueBadge'
import { StandardForm } from '@/components/forms'
import { deleteRow } from '@/lib/data'
import { fmtDate, joinNonEmpty } from '@/lib/format'
import type { ReferenceStandard } from '@/powersync/AppSchema'

type Std = ReferenceStandard & { id: string }

export function Standards() {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Std | null | 'new'>(null)
  const like = `%${q.trim()}%`
  const { data, isLoading } = useQuery<Std>(
    'SELECT * FROM reference_standards WHERE name LIKE ? OR serial_number LIKE ? OR model LIKE ? OR asset_tag LIKE ? ORDER BY due_at IS NULL, due_at',
    [like, like, like, like]
  )
  return (
    <>
      <PageHeader title="Reference standards" subtitle="Your traceable test equipment — selected on each calibration" actions={<Button onClick={() => setEditing('new')}><Plus size={16} />New standard</Button>} />
      <Card>
        <div className="border-b border-slate-100 px-4 py-3"><SearchInput value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<Ruler size={20} />} title="No reference standards" action={!q && <Button onClick={() => setEditing('new')}><Plus size={16} />Add a standard</Button>}>
            Add the calibrators, gauges and meters you use so each calibration records its traceability.
          </EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Name</th><th className={th}>Serial</th><th className={th}>Certificate</th><th className={th}>Calibrated</th><th className={th}>Status</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((s) => (
                <tr key={s.id} className="group hover:bg-slate-50">
                  <td className={td}><div className="font-medium text-slate-800">{s.name}</div><div className="text-xs text-slate-500">{joinNonEmpty([s.manufacturer, s.model, s.asset_tag && `Tag ${s.asset_tag}`], ' · ')}</div></td>
                  <td className={`${td} font-mono text-xs text-slate-600`}>{s.serial_number || '—'}</td>
                  <td className={`${td} text-slate-600`}>{s.certificate_number || '—'}</td>
                  <td className={`${td} text-slate-600`}>{fmtDate(s.calibrated_at)}</td>
                  <td className={td}><DueBadge date={s.due_at} showDate /></td>
                  <td className={`${td} text-right`}>
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil size={13} />Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => confirm(`Delete ${s.name}?`) && deleteRow('reference_standards', s.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <StandardForm open={editing !== null} onClose={() => setEditing(null)} standard={editing === 'new' ? null : editing} />
    </>
  )
}
