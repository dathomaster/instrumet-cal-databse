import { memo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarPlus, ClipboardCheck, Pencil } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { Button, Card, CardHeader, DetailGrid, EmptyState, PageHeader, td, th } from '@/components/ui'
import { BackLink } from '@/components/BackLink'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { EquipmentForm } from '@/components/forms'
import { DueBadge, ResultBadge } from '@/components/DueBadge'
import { fmtDate, joinNonEmpty } from '@/lib/format'
import { useMe } from '@/lib/hooks'
import { useAuth } from '@/lib/auth'
import { deleteEquipment, startVisit } from '@/lib/calibrationActions'
import { equipmentLabel, typeLabel } from '@/lib/sheets'
import type { Equipment } from '@/powersync/AppSchema'

type Eq = Equipment & { id: string; customer_name: string }
interface CalRow { id: string; performed_at: string; certificate_number: string | null; technician_name: string | null; status: string; result: string | null; visit_id: string }

export function EquipmentDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { me } = useMe()
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const { data: rows, isLoading } = useRows<Eq>('SELECT e.*, c.name AS customer_name FROM equipment e JOIN customers c ON c.id = e.customer_id WHERE e.id = ?', [id])
  const e = rows[0]
  const { data: frames } = useRows<Equipment & { id: string }>('SELECT * FROM equipment WHERE id = ?', [e?.test_frame_id ?? ''])
  const { data: mounted } = useRows<Equipment & { id: string }>("SELECT * FROM equipment WHERE test_frame_id = ? ORDER BY model", [id])
  const { data: cals } = useRows<CalRow>(
    'SELECT id, performed_at, certificate_number, technician_name, status, result, visit_id FROM calibrations WHERE equipment_id = ? ORDER BY performed_at DESC, created_at DESC',
    [id]
  )
  if (!e) return isLoading ? null : <EmptyState title="Equipment not found">It may have been deleted by another technician.</EmptyState>
  const frame = frames[0]

  /** Calibrations happen within a visit: start one for this customer, then pick this equipment. */
  async function newVisit() {
    const vid = await startVisit(e.customer_id!, { userId: user!.id, name: me?.full_name || user!.email })
    nav(`/visits/${vid}?equipment=${id}`)
  }

  const typeFields: [string, React.ReactNode][] =
    e.equipment_type === 'crosshead'
      ? [['Machine model', e.model], ['Machine SN', e.serial_number], ['Indicating device model', e.indicator_model], ['Indicating device SN', e.indicator_serial]]
      : e.equipment_type === 'load_cell'
        ? [['Device model', e.model], ['Device SN', e.serial_number], ['Capacity', e.capacity ? `${e.capacity} ${e.units ?? ''}` : null],
            ['Test frame', frame ? <Link to={`/equipment/${frame.id}`} className="text-brand-700 hover:underline">{equipmentLabel(frame)}</Link> : null]]
        : [['Device model', e.model], ['Device SN', e.serial_number], ['Gauge length', e.gauge_length ? `${e.gauge_length} ${e.gauge_length_units ?? ''}` : null]]

  return (
    <>
      <PageHeader
        back={<BackLink to={`/customers/${e.customer_id}`} label={e.customer_name} />}
        title={e.description || joinNonEmpty([typeLabel(e.equipment_type), e.model], ' · ')}
        subtitle={joinNonEmpty([typeLabel(e.equipment_type), e.serial_number && `SN ${e.serial_number}`], ' · ')}
        actions={
          <>
            <ConfirmDelete what="equipment" detail={`This also deletes ${cals.length} calibration record(s).`} onConfirm={async () => { await deleteEquipment(id); nav(`/customers/${e.customer_id}`) }} />
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} />Edit</Button>
            <Button onClick={newVisit} disabled={!me}><CalendarPlus size={16} />New visit &amp; calibrate</Button>
          </>
        }
      />
      <Card className="mb-6">
        <CardHeader title="Equipment details" actions={e.status === 'active' ? <DueBadge date={e.next_due_at} showDate /> : <span className="text-xs capitalize text-slate-500">{e.status?.replace(/_/g, ' ')}</span>} />
        <DetailGrid
          items={[
            ['Customer', <Link to={`/customers/${e.customer_id}`} className="text-brand-700 hover:underline">{e.customer_name}</Link>],
            ['Type', typeLabel(e.equipment_type)],
            ...typeFields,
            ['Manufacturer', e.manufacturer],
            ['Asset tag', e.asset_tag],
            ['Location', e.location],
            ['Interval', e.calibration_interval_days ? `${e.calibration_interval_days} days` : null],
            ['Last calibrated', fmtDate(e.last_calibrated_at)],
            ['Next due', fmtDate(e.next_due_at)]
          ]}
        />
        {mounted.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
            Load cells on this frame: {mounted.map((m, i) => <span key={m.id}>{i > 0 && ', '}<Link to={`/equipment/${m.id}`} className="text-brand-700 hover:underline">{equipmentLabel(m)}</Link></span>)}
          </p>
        )}
        {e.notes && <p className="whitespace-pre-wrap border-t border-slate-100 px-5 py-4 text-sm text-slate-600">{e.notes}</p>}
      </Card>
      <Card>
        <CardHeader title="Calibration history" subtitle={`${cals.length} record${cals.length === 1 ? '' : 's'}`} />
        {cals.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={20} />} title="No calibrations yet" action={<Button onClick={newVisit} disabled={!me}><CalendarPlus size={16} />New visit &amp; calibrate</Button>} />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Date</th><th className={th}>Certificate</th><th className={th}>Technician</th><th className={th}>Result</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{cals.map((k) => <CalibrationRow key={k.id} k={k} />)}</tbody>
          </table>
        )}
      </Card>
      <EquipmentForm open={editing} onClose={() => setEditing(false)} equipment={e} />
    </>
  )
}

/** Memoized: re-renders only when this row's data changes. */
const CalibrationRow = memo(function CalibrationRow({ k }: { k: CalRow }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/calibrations/${k.id}`)}>
      <td className={td}><Link to={`/calibrations/${k.id}`} className="font-medium text-slate-800">{fmtDate(k.performed_at)}</Link></td>
      <td className={`${td} font-mono text-xs text-slate-600`}>{k.certificate_number}</td>
      <td className={`${td} text-slate-600`}>{k.technician_name || '—'}</td>
      <td className={td}>{k.status === 'draft' ? <span className="text-xs font-medium text-sky-700">Draft — in progress</span> : <ResultBadge result={k.result} />}</td>
    </tr>
  )
})
