import { memo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRows } from '@/lib/useRows'
import { ClipboardCheck, Pencil, Plus } from 'lucide-react'
import { Button, Card, CardHeader, DetailGrid, EmptyState, PageHeader, td, th } from '@/components/ui'
import { BackLink } from '@/components/BackLink'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { EquipmentForm } from '@/components/forms'
import { DueBadge, ResultBadge } from '@/components/DueBadge'
import { fmtDate, joinNonEmpty } from '@/lib/format'
import { useMe } from '@/lib/hooks'
import { useAuth } from '@/lib/auth'
import { deleteEquipment, startCalibration } from '@/lib/calibrationActions'
import type { Calibration, Equipment } from '@/powersync/AppSchema'

export function EquipmentDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { me } = useMe()
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const { data: rows, isLoading } = useRows<Equipment & { id: string; customer_name: string }>(
    'SELECT e.*, c.name AS customer_name FROM equipment e JOIN customers c ON c.id = e.customer_id WHERE e.id = ?',
    [id]
  )
  const { data: cals } = useRows<Calibration & { id: string; points: number }>(
    `SELECT k.*, (SELECT count(*) FROM calibration_points p WHERE p.calibration_id = k.id) AS points
     FROM calibrations k WHERE k.equipment_id = ? ORDER BY k.performed_at DESC, k.created_at DESC`,
    [id]
  )
  const e = rows[0]
  if (!e) return isLoading ? null : <EmptyState title="Equipment not found">It may have been deleted by another technician.</EmptyState>

  async function newCal() {
    const calId = await startCalibration(e, { userId: user!.id, name: me?.full_name || user!.email })
    nav(`/calibrations/${calId}`)
  }

  const range = e.range_min || e.range_max ? `${e.range_min ?? '?'} – ${e.range_max ?? '?'} ${e.units ?? ''}` : null

  return (
    <>
      <PageHeader
        back={<BackLink to={`/customers/${e.customer_id}`} label={e.customer_name} />}
        title={e.description}
        subtitle={joinNonEmpty([e.manufacturer, e.model, e.serial_number && `S/N ${e.serial_number}`], ' · ')}
        actions={
          <>
            <ConfirmDelete what="equipment" detail={`This also deletes ${cals.length} calibration record(s).`} onConfirm={async () => { await deleteEquipment(id); nav(`/customers/${e.customer_id}`) }} />
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} />Edit</Button>
            <Button onClick={newCal} disabled={!me}><Plus size={16} />New calibration</Button>
          </>
        }
      />
      <Card className="mb-6">
        <CardHeader title="Equipment details" actions={e.status === 'active' ? <DueBadge date={e.next_due_at} showDate /> : <span className="text-xs capitalize text-slate-500">{e.status?.replace(/_/g, ' ')}</span>} />
        <DetailGrid
          items={[
            ['Customer', <Link to={`/customers/${e.customer_id}`} className="text-brand-700 hover:underline">{e.customer_name}</Link>],
            ['Asset tag', e.asset_tag],
            ['Type', e.equipment_type],
            ['Manufacturer', e.manufacturer],
            ['Model', e.model],
            ['Serial number', e.serial_number],
            ['Range', range],
            ['Location', e.location],
            ['Interval', e.calibration_interval_days ? `${e.calibration_interval_days} days` : null],
            ['Last calibrated', fmtDate(e.last_calibrated_at)],
            ['Next due', fmtDate(e.next_due_at)]
          ]}
        />
        {e.notes && <p className="whitespace-pre-wrap border-t border-slate-100 px-5 py-4 text-sm text-slate-600">{e.notes}</p>}
      </Card>
      <Card>
        <CardHeader title="Calibration history" subtitle={`${cals.length} record${cals.length === 1 ? '' : 's'}`} />
        {cals.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={20} />} title="No calibrations yet" action={<Button onClick={newCal} disabled={!me}><Plus size={16} />Start first calibration</Button>} />
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Date</th><th className={th}>Certificate</th><th className={th}>Technician</th><th className={th}>Points</th><th className={th}>As found</th><th className={th}>As left</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {cals.map((k) => <CalibrationRow key={k.id} k={k} />)}
            </tbody>
          </table>
        )}
      </Card>
      <EquipmentForm open={editing} onClose={() => setEditing(false)} equipment={e} />
    </>
  )
}

/** Memoized: re-renders only when this row's data changes. */
const CalibrationRow = memo(function CalibrationRow({ k }: { k: Calibration & { id: string; points: number } }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/calibrations/${k.id}`)}>
      <td className={td}><Link to={`/calibrations/${k.id}`} className="font-medium text-slate-800">{fmtDate(k.performed_at)}</Link></td>
      <td className={`${td} font-mono text-xs text-slate-600`}>{k.certificate_number}</td>
      <td className={`${td} text-slate-600`}>{k.technician_name || '—'}</td>
      <td className={`${td} text-slate-600`}>{k.points}</td>
      {k.status === 'draft' ? (
        <td className={td} colSpan={2}><span className="text-xs font-medium text-sky-700">Draft — in progress</span></td>
      ) : (
        <>
          <td className={td}><ResultBadge result={k.as_found_result} /></td>
          <td className={td}><ResultBadge result={k.as_left_result} /></td>
        </>
      )}
    </tr>
  )
})
