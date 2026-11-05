import { memo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarCheck, Pencil, Plus, Wrench } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { Badge, Button, Card, CardHeader, DetailGrid, EmptyState, PageHeader, td, th } from '@/components/ui'
import { BackLink } from '@/components/BackLink'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { CustomerForm, EquipmentForm } from '@/components/forms'
import { NewVisitButton } from '@/components/NewVisit'
import { DueBadge } from '@/components/DueBadge'
import { deleteCustomer } from '@/lib/calibrationActions'
import { fmtDate, joinNonEmpty } from '@/lib/format'
import { typeLabel } from '@/lib/sheets'
import type { Customer, Equipment } from '@/powersync/AppSchema'

type Eq = Equipment & { id: string }
interface VisitRow { id: string; visit_date: string; location: string | null; status: string; cal_count: number }

export function CustomerDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [addingEq, setAddingEq] = useState(false)
  const { data: rows, isLoading } = useRows<Customer & { id: string }>('SELECT * FROM customers WHERE id = ?', [id])
  const { data: visits } = useRows<VisitRow>(
    `SELECT v.id, v.visit_date, v.location, v.status, (SELECT count(*) FROM calibrations k WHERE k.visit_id = v.id) AS cal_count
     FROM visits v WHERE v.customer_id = ? ORDER BY v.visit_date DESC, v.created_at DESC`,
    [id]
  )
  const { data: equipment } = useRows<Eq>(
    `SELECT * FROM equipment WHERE customer_id = ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, equipment_type, model COLLATE NOCASE`,
    [id]
  )
  const c = rows[0]
  if (!c) return isLoading ? null : <EmptyState title="Customer not found">It may have been deleted by another technician.</EmptyState>

  return (
    <>
      <PageHeader
        back={<BackLink to="/customers" label="Customers" />}
        title={c.name}
        subtitle={joinNonEmpty([c.city, c.state, c.location])}
        actions={
          <>
            <ConfirmDelete what="customer" detail={`This also deletes their ${visits.length} visit(s), ${equipment.length} equipment record(s) and all calibrations.`} onConfirm={async () => { await deleteCustomer(id); nav('/customers') }} />
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} />Edit</Button>
            <NewVisitButton customerId={id} />
          </>
        }
      />
      <Card className="mb-6">
        <CardHeader title="Customer details" subtitle={`Updated ${fmtDate(c.updated_at)}`} />
        <DetailGrid
          items={[
            ['Street', c.address_line1],
            ['City / State / ZIP', joinNonEmpty([c.city, joinNonEmpty([c.state, c.postal_code], ' ')])],
            ['Specific location', c.location || 'Test Lab'],
            ['Contact name', c.contact_name],
            ['Contact phone', c.phone],
            ['Contact email', c.email]
          ]}
        />
        {c.notes && <p className="whitespace-pre-wrap border-t border-slate-100 px-5 py-4 text-sm text-slate-600">{c.notes}</p>}
      </Card>

      <Card className="mb-6">
        <CardHeader title="Visits" subtitle={`${visits.length} visit${visits.length === 1 ? '' : 's'}`} actions={<NewVisitButton customerId={id} variant="secondary" />} />
        {visits.length === 0 ? (
          <EmptyState icon={<CalendarCheck size={20} />} title="No visits yet">Start a visit to calibrate this customer’s equipment.</EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Date</th><th className={th}>Location</th><th className={th}>Calibrations</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{visits.map((v) => <CustomerVisitRow key={v.id} v={v} />)}</tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="Equipment" subtitle={`${equipment.length} item${equipment.length === 1 ? '' : 's'}`} actions={<Button size="sm" variant="secondary" onClick={() => setAddingEq(true)}><Plus size={14} />Add equipment</Button>} />
        {equipment.length === 0 ? (
          <EmptyState icon={<Wrench size={20} />} title="No equipment yet">Load cells, extensometers and crossheads you calibrate for this customer.</EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Equipment</th><th className={th}>Type</th><th className={th}>Serial</th><th className={th}>Last cal</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{equipment.map((e) => <EquipmentRow key={e.id} e={e} />)}</tbody>
          </table>
        )}
      </Card>
      <CustomerForm open={editing} onClose={() => setEditing(false)} customer={c} />
      <EquipmentForm open={addingEq} onClose={() => setAddingEq(false)} customerId={id} onCreated={(eid) => nav(`/equipment/${eid}`)} />
    </>
  )
}

const CustomerVisitRow = memo(function CustomerVisitRow({ v }: { v: VisitRow }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/visits/${v.id}`)}>
      <td className={td}><Link to={`/visits/${v.id}`} className="font-medium text-slate-800">{fmtDate(v.visit_date)}</Link></td>
      <td className={`${td} text-slate-600`}>{v.location || '—'}</td>
      <td className={`${td} text-slate-600`}>{v.cal_count}</td>
      <td className={td}>{v.status === 'completed' ? <Badge tone="green">Completed</Badge> : <Badge tone="blue">Open</Badge>}</td>
    </tr>
  )
})

/** Memoized: re-renders only when this row's data changes. */
const EquipmentRow = memo(function EquipmentRow({ e }: { e: Eq }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/equipment/${e.id}`)}>
      <td className={td}>
        <Link to={`/equipment/${e.id}`} className="font-medium text-slate-800">{e.description || e.model || typeLabel(e.equipment_type)}</Link>
        {e.capacity && <div className="text-xs text-slate-500">{e.capacity} {e.units}</div>}
      </td>
      <td className={`${td} text-slate-600`}>{typeLabel(e.equipment_type)}</td>
      <td className={`${td} font-mono text-xs text-slate-600`}>{e.serial_number || '—'}</td>
      <td className={`${td} text-slate-600`}>{fmtDate(e.last_calibrated_at)}</td>
      <td className={td}>{e.status === 'active' ? <DueBadge date={e.next_due_at} /> : <span className="text-xs capitalize text-slate-500">{e.status?.replace(/_/g, ' ')}</span>}</td>
    </tr>
  )
})
