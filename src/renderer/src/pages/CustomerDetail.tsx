import { memo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRows } from '@/lib/useRows'
import { Pencil, Plus, Wrench } from 'lucide-react'
import { Button, Card, CardHeader, DetailGrid, EmptyState, PageHeader, td, th } from '@/components/ui'
import { BackLink } from '@/components/BackLink'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { CustomerForm, EquipmentForm } from '@/components/forms'
import { DueBadge } from '@/components/DueBadge'
import { deleteCustomer } from '@/lib/calibrationActions'
import { fmtDate, joinNonEmpty } from '@/lib/format'
import type { Customer, Equipment } from '@/powersync/AppSchema'

export function CustomerDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [addingEq, setAddingEq] = useState(false)
  const { data: rows, isLoading } = useRows<Customer & { id: string }>('SELECT * FROM customers WHERE id = ?', [id])
  const { data: equipment } = useRows<Equipment & { id: string }>(
    `SELECT * FROM equipment WHERE customer_id = ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, next_due_at IS NULL, next_due_at`,
    [id]
  )
  const c = rows[0]
  if (!c) return isLoading ? null : <EmptyState title="Customer not found">It may have been deleted by another technician.</EmptyState>

  return (
    <>
      <PageHeader
        back={<BackLink to="/customers" label="Customers" />}
        title={c.name}
        subtitle={joinNonEmpty([c.city, c.state])}
        actions={
          <>
            <ConfirmDelete what="customer" detail={`This also deletes ${equipment.length} equipment record(s) and all of their calibrations.`} onConfirm={async () => { await deleteCustomer(id); nav('/customers') }} />
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} />Edit</Button>
          </>
        }
      />
      <Card className="mb-6">
        <CardHeader title="Customer details" subtitle={`Updated ${fmtDate(c.updated_at)}`} />
        <DetailGrid
          items={[
            ['Contact', c.contact_name],
            ['Phone', c.phone],
            ['Email', c.email],
            ['Address', joinNonEmpty([c.address_line1, c.address_line2])],
            ['City / State / ZIP', joinNonEmpty([c.city, joinNonEmpty([c.state, c.postal_code], ' ')])],
            ['Country', c.country]
          ]}
        />
        {c.notes && <p className="whitespace-pre-wrap border-t border-slate-100 px-5 py-4 text-sm text-slate-600">{c.notes}</p>}
      </Card>
      <Card>
        <CardHeader title="Equipment" subtitle={`${equipment.length} item${equipment.length === 1 ? '' : 's'}`} actions={<Button size="sm" onClick={() => setAddingEq(true)}><Plus size={14} />Add equipment</Button>} />
        {equipment.length === 0 ? (
          <EmptyState icon={<Wrench size={20} />} title="No equipment yet" action={<Button onClick={() => setAddingEq(true)}><Plus size={16} />Add equipment</Button>}>
            Add the instruments you calibrate for this customer.
          </EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Description</th><th className={th}>Make / model</th><th className={th}>Serial</th><th className={th}>Last cal</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {equipment.map((e) => <EquipmentRow key={e.id} e={e} />)}
            </tbody>
          </table>
        )}
      </Card>
      <CustomerForm open={editing} onClose={() => setEditing(false)} customer={c} />
      <EquipmentForm open={addingEq} onClose={() => setAddingEq(false)} customerId={id} onCreated={(eid) => nav(`/equipment/${eid}`)} />
    </>
  )
}

/** Memoized: re-renders only when this row's data changes. */
const EquipmentRow = memo(function EquipmentRow({ e }: { e: Equipment & { id: string } }) {
  const nav = useNavigate()
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/equipment/${e.id}`)}>
      <td className={td}>
        <Link to={`/equipment/${e.id}`} className="font-medium text-slate-800">{e.description}</Link>
        {e.asset_tag && <div className="text-xs text-slate-500">Tag {e.asset_tag}</div>}
      </td>
      <td className={`${td} text-slate-600`}>{joinNonEmpty([e.manufacturer, e.model], ' ') || '—'}</td>
      <td className={`${td} font-mono text-xs text-slate-600`}>{e.serial_number || '—'}</td>
      <td className={`${td} text-slate-600`}>{fmtDate(e.last_calibrated_at)}</td>
      <td className={td}>{e.status === 'active' ? <DueBadge date={e.next_due_at} /> : <span className="text-xs capitalize text-slate-500">{e.status?.replace(/_/g, ' ')}</span>}</td>
    </tr>
  )
})
