import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Plus } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { useAuth } from '@/lib/auth'
import { useMe } from '@/lib/hooks'
import { todayISO } from '@/lib/format'
import { startVisit } from '@/lib/calibrationActions'
import { CustomerForm } from './forms'
import { Button, Field, Input, Modal, Select } from './ui'

/** "New visit" button + dialog: choose a customer (or add one) and a date. */
export function NewVisitButton({ customerId, variant = 'primary' }: { customerId?: string; variant?: 'primary' | 'secondary' }) {
  const [open, setOpen] = useState(false)
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [cust, setCust] = useState(customerId ?? '')
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const { user } = useAuth()
  const { me } = useMe()
  const nav = useNavigate()
  const { data: customers } = useRows<{ id: string; name: string; location: string | null }>('SELECT id, name, location FROM customers ORDER BY name COLLATE NOCASE')
  useEffect(() => { if (open) { setCust(customerId ?? ''); setDate(todayISO()) } }, [open, customerId])
  const chosen = customers.find((c) => c.id === cust)

  async function start() {
    if (!cust || !user) return
    setBusy(true)
    try {
      const id = await startVisit(cust, { userId: user.id, name: me?.full_name || user.email }, date || todayISO())
      setOpen(false)
      nav(`/visits/${id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><CalendarPlus size={16} />New visit</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New visit"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={start} disabled={!cust || busy}>Start visit</Button></>}
      >
        <div className="space-y-4">
          <Field label="Customer">
            <div className="flex gap-2">
              <Select value={cust} onChange={(e) => setCust(e.target.value)} disabled={!!customerId} aria-label="Customer">
                <option value="">Select customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {!customerId && <Button variant="secondary" type="button" onClick={() => setAddingCustomer(true)}><Plus size={15} />New customer</Button>}
            </div>
          </Field>
          {chosen && <p className="text-sm text-slate-500">Location: <span className="text-slate-800">{chosen.location || 'Test Lab'}</span> (you can change it on the visit)</p>}
          <Field label="Visit date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
      </Modal>
      <CustomerForm open={addingCustomer} onClose={() => setAddingCustomer(false)} onCreated={(id) => setCust(id)} />
    </>
  )
}
