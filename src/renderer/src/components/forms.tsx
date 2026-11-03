import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useRows } from '@/lib/useRows'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'
import { insertRow, pick, updateRow } from '@/lib/data'
import { useMe } from '@/lib/hooks'
import { useAuth } from '@/lib/auth'
import { addDays, dateOnly } from '@/lib/format'
import type { Customer, Equipment, ReferenceStandard } from '@/powersync/AppSchema'

type Values = Record<string, string | number | null | undefined>

/** Generic modal form: insert when `existing` is null, else patch changed fields. */
function useForm(keys: string[], existing: Values | null, open: boolean) {
  const [v, setV] = useState<Values>(() => pick(existing, keys))
  useEffect(() => {
    if (open) setV(pick(existing, keys))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, (existing as { id?: string } | null)?.id])
  const bind = (k: string) => ({
    value: (v[k] ?? '') as string,
    onChange: (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }))
  })
  return { v, setV, bind }
}

function FormModal({
  open, onClose, title, onSubmit, children, wide, submitLabel = 'Save'
}: { open: boolean; onClose: () => void; title: string; onSubmit: () => Promise<void>; children: ReactNode; wide?: boolean; submitLabel?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [open])
  async function submit(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide={wide}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button onClick={() => submit()} disabled={busy} type="button">{submitLabel}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        {children}
        {error && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- customers
const CUSTOMER_KEYS = ['name', 'contact_name', 'email', 'phone', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'notes']

export function CustomerForm({ open, onClose, customer, onCreated }: { open: boolean; onClose: () => void; customer?: (Customer & { id: string }) | null; onCreated?: (id: string) => void }) {
  const { me } = useMe()
  const { user } = useAuth()
  const { v, bind } = useForm(CUSTOMER_KEYS, customer ?? null, open)
  return (
    <FormModal
      open={open}
      onClose={onClose}
      wide
      title={customer ? 'Edit customer' : 'New customer'}
      onSubmit={async () => {
        if (!String(v.name ?? '').trim()) throw new Error('Name required')
        if (customer) await updateRow('customers', customer.id, v, customer as Values)
        else onCreated?.(await insertRow('customers', { ...v, org_id: me!.org_id, created_by: user!.id }))
      }}
    >
      <Field label="Company / customer name *" className="col-span-2"><Input {...bind('name')} required autoFocus /></Field>
      <Field label="Contact name"><Input {...bind('contact_name')} /></Field>
      <Field label="Phone"><Input {...bind('phone')} /></Field>
      <Field label="Email" className="col-span-2"><Input type="email" {...bind('email')} /></Field>
      <Field label="Address" className="col-span-2"><Input {...bind('address_line1')} /></Field>
      <Field label="Address line 2" className="col-span-2"><Input {...bind('address_line2')} /></Field>
      <Field label="City"><Input {...bind('city')} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="State"><Input {...bind('state')} /></Field>
        <Field label="ZIP"><Input {...bind('postal_code')} /></Field>
      </div>
      <Field label="Notes" className="col-span-2"><Textarea {...bind('notes')} /></Field>
    </FormModal>
  )
}

// ---------------------------------------------------------------- equipment
const EQUIPMENT_KEYS = ['customer_id', 'description', 'asset_tag', 'equipment_type', 'manufacturer', 'model', 'serial_number', 'location', 'range_min', 'range_max', 'units', 'calibration_interval_days', 'last_calibrated_at', 'next_due_at', 'status', 'notes']

export function EquipmentForm({ open, onClose, equipment, customerId, onCreated }: { open: boolean; onClose: () => void; equipment?: (Equipment & { id: string }) | null; customerId?: string; onCreated?: (id: string) => void }) {
  const { me } = useMe()
  const { user } = useAuth()
  const { data: customers } = useRows<{ id: string; name: string }>('SELECT id, name FROM customers ORDER BY name')
  const initial = equipment
    ? { ...equipment, last_calibrated_at: dateOnly(equipment.last_calibrated_at), next_due_at: dateOnly(equipment.next_due_at) }
    : { customer_id: customerId ?? '', calibration_interval_days: 365, status: 'active' }
  const { v, setV, bind } = useForm(EQUIPMENT_KEYS, initial as Values, open)

  // Keep "next due" in step with "last calibrated" + interval unless edited by hand
  function setLastCal(val: string) {
    const interval = Number(v.calibration_interval_days) || 0
    setV((s) => ({ ...s, last_calibrated_at: val, next_due_at: val && interval ? addDays(val, interval) : s.next_due_at }))
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      wide
      title={equipment ? 'Edit equipment' : 'Add equipment'}
      onSubmit={async () => {
        const row: Values = { ...v, calibration_interval_days: v.calibration_interval_days === '' ? null : Number(v.calibration_interval_days) }
        if (!row.customer_id || !String(row.description ?? '').trim()) throw new Error('Customer and description required')
        if (equipment) await updateRow('equipment', equipment.id, row, initial as Values)
        else onCreated?.(await insertRow('equipment', { ...row, org_id: me!.org_id, created_by: user!.id }))
      }}
    >
      <Field label="Customer *" className="col-span-2">
        <Select {...bind('customer_id')} required disabled={!!customerId && !equipment}>
          <option value="">Select customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Description *" className="col-span-2"><Input {...bind('description')} placeholder="e.g. Digital pressure gauge" required autoFocus /></Field>
      <Field label="Asset tag / ID"><Input {...bind('asset_tag')} /></Field>
      <Field label="Type"><Input {...bind('equipment_type')} placeholder="Pressure, Temperature, Electrical…" list="eq-types" /></Field>
      <datalist id="eq-types">
        {['Pressure', 'Temperature', 'Electrical', 'Dimensional', 'Mass / Force', 'Torque', 'Flow', 'Humidity'].map((t) => <option key={t} value={t} />)}
      </datalist>
      <Field label="Manufacturer"><Input {...bind('manufacturer')} /></Field>
      <Field label="Model"><Input {...bind('model')} /></Field>
      <Field label="Serial number"><Input {...bind('serial_number')} /></Field>
      <Field label="Location"><Input {...bind('location')} placeholder="Building / line / room" /></Field>
      <div className="col-span-2 grid grid-cols-3 gap-4">
        <Field label="Range min"><Input type="number" step="any" {...bind('range_min')} /></Field>
        <Field label="Range max"><Input type="number" step="any" {...bind('range_max')} /></Field>
        <Field label="Units"><Input {...bind('units')} placeholder="psi, °C, V…" /></Field>
      </div>
      <div className="col-span-2 grid grid-cols-3 gap-4">
        <Field label="Interval (days)"><Input type="number" min={0} {...bind('calibration_interval_days')} /></Field>
        <Field label="Last calibrated"><Input type="date" value={(v.last_calibrated_at ?? '') as string} onChange={(e) => setLastCal(e.target.value)} /></Field>
        <Field label="Next due"><Input type="date" {...bind('next_due_at')} /></Field>
      </div>
      <Field label="Status">
        <Select {...bind('status')}>
          <option value="active">Active</option>
          <option value="out_of_service">Out of service</option>
          <option value="retired">Retired</option>
        </Select>
      </Field>
      <div />
      <Field label="Notes" className="col-span-2"><Textarea {...bind('notes')} /></Field>
    </FormModal>
  )
}

// ---------------------------------------------------------------- reference standards
const STANDARD_KEYS = ['name', 'manufacturer', 'model', 'serial_number', 'asset_tag', 'certificate_number', 'calibrated_at', 'due_at', 'notes']

export function StandardForm({ open, onClose, standard }: { open: boolean; onClose: () => void; standard?: (ReferenceStandard & { id: string }) | null }) {
  const { me } = useMe()
  const initial = standard ? { ...standard, calibrated_at: dateOnly(standard.calibrated_at), due_at: dateOnly(standard.due_at) } : null
  const { v, bind } = useForm(STANDARD_KEYS, initial as Values | null, open)
  return (
    <FormModal
      open={open}
      onClose={onClose}
      wide
      title={standard ? 'Edit reference standard' : 'New reference standard'}
      onSubmit={async () => {
        if (!String(v.name ?? '').trim()) throw new Error('Name required')
        if (standard) await updateRow('reference_standards', standard.id, v, initial as Values)
        else await insertRow('reference_standards', { ...v, org_id: me!.org_id })
      }}
    >
      <Field label="Name *" className="col-span-2"><Input {...bind('name')} placeholder="e.g. Fluke 754 Documenting Process Calibrator" required autoFocus /></Field>
      <Field label="Manufacturer"><Input {...bind('manufacturer')} /></Field>
      <Field label="Model"><Input {...bind('model')} /></Field>
      <Field label="Serial number"><Input {...bind('serial_number')} /></Field>
      <Field label="Asset tag"><Input {...bind('asset_tag')} /></Field>
      <Field label="Cal certificate #" className="col-span-2"><Input {...bind('certificate_number')} /></Field>
      <Field label="Calibrated on"><Input type="date" {...bind('calibrated_at')} /></Field>
      <Field label="Due"><Input type="date" {...bind('due_at')} /></Field>
      <Field label="Notes" className="col-span-2"><Textarea {...bind('notes')} /></Field>
    </FormModal>
  )
}
