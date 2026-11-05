import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { useAuth } from '@/lib/auth'
import { useMe } from '@/lib/hooks'
import { startCalibration } from '@/lib/calibrationActions'
import { equipmentLabel, sectionsFor, type CalConfig } from '@/lib/sheets'
import type { Equipment } from '@/powersync/AppSchema'
import { EquipmentForm } from './forms'
import { Segmented } from './Segmented'
import { Button, Field, Modal, Select } from './ui'

type Eq = Equipment & { id: string }
type Both<A extends string, B extends string> = A | B | 'both'

/** Choose the equipment (or add it) and the type-specific options, then start. */
export function StartCalibrationModal({ open, onClose, visitId, customerId, preselect }: { open: boolean; onClose: () => void; visitId: string; customerId: string; preselect?: string }) {
  const { user } = useAuth()
  const { me } = useMe()
  const nav = useNavigate()
  const [eqId, setEqId] = useState('')
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<Both<'tension', 'compression'>>('tension')
  const [tests, setTests] = useState<Both<'displacement', 'speed'>>('both')
  const [dirs, setDirs] = useState<Both<'up', 'down'>>('both')
  const [lu, setLu] = useState<'in' | 'mm'>('in')
  const [busy, setBusy] = useState(false)
  const { data: equipment } = useRows<Eq>(
    "SELECT * FROM equipment WHERE customer_id = ? ORDER BY status != 'active', equipment_type, model COLLATE NOCASE",
    [customerId]
  )
  useEffect(() => { if (open) setEqId(preselect ?? '') }, [open, preselect])
  const eq = equipment.find((e) => e.id === eqId)

  const config: CalConfig =
    eq?.equipment_type === 'load_cell' ? { modes: mode === 'both' ? ['tension', 'compression'] : [mode] }
    : eq?.equipment_type === 'crosshead' ? { tests: tests === 'both' ? ['displacement', 'speed'] : [tests], directions: dirs === 'both' ? ['up', 'down'] : [dirs], length_units: lu }
    : {}
  const sheets = eq ? sectionsFor(eq.equipment_type, config, eq) : []

  async function start() {
    if (!eq || !user) return
    setBusy(true)
    try {
      const id = await startCalibration(visitId, eq.id, config, { userId: user.id, name: me?.full_name || user.email })
      onClose()
      nav(`/calibrations/${id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={open && !adding}
        onClose={onClose}
        title="Start new calibration"
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={start} disabled={!eq || busy}>Start calibration</Button></>}
      >
        <div className="space-y-5">
          <Field label="Equipment">
            <div className="flex gap-2">
              <Select value={eqId} onChange={(e) => setEqId(e.target.value)} aria-label="Equipment">
                <option value="">Select equipment…</option>
                {equipment.map((e) => <option key={e.id} value={e.id}>{equipmentLabel(e)}{e.status !== 'active' ? ' (inactive)' : ''}</option>)}
              </Select>
              <Button variant="secondary" type="button" onClick={() => setAdding(true)}><Plus size={15} />Add new</Button>
            </div>
          </Field>

          {eq?.equipment_type === 'load_cell' && (
            <Segmented label="Direction" value={mode} onChange={setMode} options={[{ value: 'tension', label: 'Tension' }, { value: 'compression', label: 'Compression' }, { value: 'both', label: 'Both' }]} />
          )}
          {eq?.equipment_type === 'crosshead' && (
            <div className="flex flex-wrap gap-5">
              <Segmented label="Test" value={tests} onChange={setTests} options={[{ value: 'speed', label: 'Speed' }, { value: 'displacement', label: 'Displacement' }, { value: 'both', label: 'Both' }]} />
              <Segmented label="Direction" value={dirs} onChange={setDirs} options={[{ value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'both', label: 'Both' }]} />
              <Segmented label="Units" value={lu} onChange={setLu} options={[{ value: 'in', label: 'in' }, { value: 'mm', label: 'mm' }]} />
            </div>
          )}
          {sheets.length > 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Creates {sheets.map((s) => `${s.title} (${s.rows} lines)`).join(', ')}, each with Run 1 and Run 2.
            </p>
          )}
        </div>
      </Modal>
      <EquipmentForm open={adding} onClose={() => setAdding(false)} customerId={customerId} onCreated={(id) => setEqId(id)} />
    </>
  )
}
