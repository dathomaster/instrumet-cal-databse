import { memo, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ClipboardCheck, FileText, Plus, RotateCcw } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { Badge, Button, Card, CardHeader, DetailGrid, EmptyState, Field, PageHeader, td, th } from '@/components/ui'
import { BackLink } from '@/components/BackLink'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { AutoInput, AutoTextarea } from '@/components/AutoInput'
import { ResultBadge } from '@/components/DueBadge'
import { StartCalibrationModal } from '@/components/StartCalibration'
import { dateOnly, fmtDate, joinNonEmpty, todayISO } from '@/lib/format'
import { deleteVisit, setVisitStatus } from '@/lib/calibrationActions'
import { equipmentLabel } from '@/lib/sheets'
import type { Customer, Visit } from '@/powersync/AppSchema'

interface CalRow { id: string; status: string; result: string | null; performed_at: string; certificate_number: string | null; technician_name: string | null; equipment_type: string; model: string | null; serial_number: string | null; description: string | null }

export function VisitDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const [starting, setStarting] = useState(false)
  const preselect = params.get('equipment') ?? undefined
  const { data: visits, isLoading } = useRows<Visit & { id: string }>('SELECT * FROM visits WHERE id = ?', [id])
  const v = visits[0]
  const { data: custs } = useRows<Customer & { id: string }>('SELECT * FROM customers WHERE id = ?', [v?.customer_id ?? ''])
  const c = custs[0]
  const { data: cals } = useRows<CalRow>(
    `SELECT k.id, k.status, k.result, k.performed_at, k.certificate_number, k.technician_name,
            e.equipment_type, e.model, e.serial_number, e.description
     FROM calibrations k JOIN equipment e ON e.id = k.equipment_id
     WHERE k.visit_id = ? ORDER BY k.created_at`,
    [id]
  )
  // Arriving from an equipment page with ?equipment=… opens "Start calibration" for it
  useEffect(() => { if (preselect && v) setStarting(true) }, [preselect, v?.id])

  if (!v) return isLoading ? null : <EmptyState title="Visit not found">It may have been deleted by another technician.</EmptyState>
  const done = v.status === 'completed'
  const V = { table: 'visits', rowId: id } as const

  async function completeVisit() {
    const drafts = cals.filter((k) => k.status === 'draft').length
    if (drafts && !confirm(`${drafts} calibration${drafts === 1 ? ' is' : 's are'} still in progress. Mark the visit completed anyway?`)) return
    await setVisitStatus(id, 'completed')
  }

  return (
    <>
      <PageHeader
        back={<BackLink to="/visits" label="Visits" />}
        title={<span className="flex items-center gap-3">{c?.name ?? 'Visit'} {done ? <Badge tone="green"><CheckCircle2 size={12} />Completed</Badge> : <Badge tone="blue">Open</Badge>}</span>}
        subtitle={`${fmtDate(v.visit_date)} · ${v.location || 'Test Lab'}`}
        actions={
          <>
            <ConfirmDelete what="visit" detail={`This also deletes its ${cals.length} calibration record(s).`} onConfirm={async () => { await deleteVisit(id); nav('/visits') }} />
            <Button variant="secondary" onClick={() => nav(`/visits/${id}/report`)}><FileText size={15} />Service report</Button>
            {done
              ? <Button variant="secondary" onClick={() => setVisitStatus(id, 'open')}><RotateCcw size={15} />Reopen visit</Button>
              : <Button variant="secondary" onClick={completeVisit}><CheckCircle2 size={15} />Complete visit</Button>}
            <Button onClick={() => setStarting(true)}><Plus size={16} />Start new calibration</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Visit details" actions={c && <Link to={`/customers/${c.id}`} className="text-xs font-medium text-brand-700 hover:underline">Customer details</Link>} />
          <div className="grid grid-cols-3 gap-4 p-5">
            <Field label="Visit date"><AutoInput {...V} field="visit_date" value={dateOnly(v.visit_date) || todayISO()} type="date" boxed required /></Field>
            <Field label="Location"><AutoInput {...V} field="location" value={v.location} boxed placeholder="Test Lab" /></Field>
            <Field label="Technician"><AutoInput {...V} field="technician_name" value={v.technician_name} boxed /></Field>
          </div>
          {c && (
            <DetailGrid items={[
              ['Address', joinNonEmpty([c.address_line1, c.city, joinNonEmpty([c.state, c.postal_code], ' ')])],
              ['Contact', c.contact_name],
              ['Phone', c.phone],
              ['Email', c.email]
            ]} />
          )}
        </Card>
        <Card>
          <CardHeader title="Service report notes" subtitle="Maintenance performed, concerns, recommendations" />
          <div className="p-4">
            <AutoTextarea {...V} field="notes" value={v.notes} rows={7} placeholder="e.g. Cleaned and lubricated crosshead screws. Load cell cable worn — recommend replacement." aria-label="Service report notes" />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Calibrations" subtitle={`${cals.length} in this visit`} actions={<Button size="sm" onClick={() => setStarting(true)}><Plus size={14} />Start new calibration</Button>} />
        {cals.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={20} />} title="No calibrations yet" action={<Button onClick={() => setStarting(true)}><Plus size={16} />Start new calibration</Button>}>
            Pick the equipment you’re calibrating, or add it.
          </EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Equipment</th><th className={th}>Certificate</th><th className={th}>Technician</th><th className={th}>Result</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{cals.map((k) => <VisitCalRow key={k.id} k={k} />)}</tbody>
          </table>
        )}
      </Card>

      {c && (
        <StartCalibrationModal
          open={starting}
          onClose={() => { setStarting(false); if (preselect) setParams({}, { replace: true }) }}
          visitId={id}
          customerId={c.id}
          preselect={preselect}
        />
      )}
    </>
  )
}

const VisitCalRow = memo(function VisitCalRow({ k }: { k: CalRow }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/calibrations/${k.id}`)}>
      <td className={td}><Link to={`/calibrations/${k.id}`} className="font-medium text-slate-800">{equipmentLabel(k)}</Link></td>
      <td className={`${td} font-mono text-xs text-slate-600`}>{k.certificate_number}</td>
      <td className={`${td} text-slate-600`}>{k.technician_name || '—'}</td>
      <td className={td}>{k.status === 'draft' ? <span className="text-xs font-medium text-sky-700">In progress</span> : <ResultBadge result={k.result} />}</td>
    </tr>
  )
})
