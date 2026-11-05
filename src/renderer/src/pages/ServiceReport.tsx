import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Download, Printer } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { Button } from '@/components/ui'
import { desktop } from '@/lib/desktop'
import { fmtDate, joinNonEmpty } from '@/lib/format'
import { typeLabel } from '@/lib/sheets'
import type { Customer, Visit } from '@/powersync/AppSchema'

interface Row { id: string; status: string; result: string | null; performed_at: string; certificate_number: string | null; equipment_type: string; model: string | null; serial_number: string | null; capacity: string | null; units: string | null }

/** Auto-generated service report for a visit: calibrations performed + notes. */
export function ServiceReport() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: visits } = useRows<Visit & { id: string }>('SELECT * FROM visits WHERE id = ?', [id])
  const v = visits[0]
  const { data: custs } = useRows<Customer & { id: string }>('SELECT * FROM customers WHERE id = ?', [v?.customer_id ?? ''])
  const { data: orgs } = useRows<{ name: string }>('SELECT name FROM organizations WHERE id = ?', [v?.org_id ?? ''])
  const { data: cals } = useRows<Row>(
    `SELECT k.id, k.status, k.result, k.performed_at, k.certificate_number, e.equipment_type, e.model, e.serial_number, e.capacity, e.units
     FROM calibrations k JOIN equipment e ON e.id = k.equipment_id WHERE k.visit_id = ? ORDER BY k.created_at`,
    [id]
  )
  if (!v) return null
  const c = custs[0]
  const name = `Service-report_${c?.name ?? ''}_${v.visit_date?.slice(0, 10) ?? ''}`

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Button variant="ghost" onClick={() => nav(`/visits/${id}`)}><ChevronLeft size={16} />Back to visit</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}><Printer size={15} />Print</Button>
          {desktop()?.printToPDF && <Button onClick={() => desktop()!.printToPDF(name)}><Download size={15} />Save PDF</Button>}
        </div>
      </div>
      <div className="print-page mx-auto max-w-[8.5in] rounded-xl border border-slate-200 bg-white p-10 text-[13px] text-slate-800 shadow-sm">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <div className="text-xl font-bold">{orgs[0]?.name ?? 'Calibration Services'}</div>
            <div className="text-slate-500">Service Report</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500">Visit date</div>
            <div className="text-base font-semibold">{fmtDate(v.visit_date)}</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-8">
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</h3>
            <div className="font-medium">{c?.name}</div>
            <div>{c?.address_line1}</div>
            <div>{joinNonEmpty([c?.city, joinNonEmpty([c?.state, c?.postal_code], ' ')])}</div>
            <div className="mt-1 text-slate-600">Location: {v.location || 'Test Lab'}</div>
          </section>
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</h3>
            <div>{c?.contact_name || '—'}</div>
            <div>{c?.phone}</div>
            <div>{c?.email}</div>
            <div className="mt-1 text-slate-600">Technician: {v.technician_name || '—'}</div>
          </section>
        </div>

        <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Calibrations performed</h3>
        <table className="w-full border-collapse text-[12px]" data-testid="report-calibrations">
          <thead><tr className="border-y border-slate-300 bg-slate-50 text-left">
            {['Equipment', 'Model', 'Serial number', 'Capacity', 'Date', 'Certificate', 'Result'].map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody>
            {cals.map((k) => (
              <tr key={k.id} className="border-b border-slate-200">
                <td className="px-2 py-1">{typeLabel(k.equipment_type)}</td>
                <td className="px-2 py-1">{k.model || '—'}</td>
                <td className="px-2 py-1">{k.serial_number || '—'}</td>
                <td className="px-2 py-1">{k.capacity ? `${k.capacity} ${k.units ?? ''}` : '—'}</td>
                <td className="px-2 py-1">{fmtDate(k.performed_at)}</td>
                <td className="px-2 py-1 font-mono">{k.certificate_number}</td>
                <td className="px-2 py-1 font-medium">{k.status === 'draft' ? 'In progress' : (k.result ?? '—').toUpperCase()}</td>
              </tr>
            ))}
            {cals.length === 0 && <tr><td colSpan={7} className="px-2 py-2 text-slate-500">No calibrations recorded.</td></tr>}
          </tbody>
        </table>

        <h3 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Maintenance performed / concerns</h3>
        <p className="min-h-16 whitespace-pre-wrap" data-testid="report-notes">{v.notes || 'None noted.'}</p>

        <div className="mt-12 grid grid-cols-2 gap-12">
          <div className="border-t border-slate-400 pt-1 text-xs text-slate-500">Technician: {v.technician_name}</div>
          <div className="border-t border-slate-400 pt-1 text-xs text-slate-500">Customer signature</div>
        </div>
      </div>
    </div>
  )
}
