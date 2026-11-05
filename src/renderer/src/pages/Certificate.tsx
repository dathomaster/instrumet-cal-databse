import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Download, Printer } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { Button } from '@/components/ui'
import { desktop } from '@/lib/desktop'
import { fmtDate, joinNonEmpty, num } from '@/lib/format'
import { sectionsOf, type StandardSnapshot } from '@/lib/calibrationActions'
import { DEFAULT_TOLERANCE_PCT, evaluateRow, fmtNum, fmtPct, typeLabel, withinTolerance } from '@/lib/sheets'
import type { Calibration, CalibrationPoint, Customer, Equipment, ReferenceStandard, Visit } from '@/powersync/AppSchema'

const pf = (ok: boolean | null) => (ok === null ? '' : ok ? 'Pass' : 'Fail')

export function Certificate() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: cals } = useRows<Calibration & { id: string }>('SELECT * FROM calibrations WHERE id = ?', [id])
  const cal = cals[0]
  const { data: eqs } = useRows<Equipment & { id: string }>('SELECT * FROM equipment WHERE id = ?', [cal?.equipment_id ?? ''])
  const eq = eqs[0]
  const { data: frames } = useRows<Equipment & { id: string }>('SELECT * FROM equipment WHERE id = ?', [eq?.test_frame_id ?? ''])
  const { data: custs } = useRows<Customer>('SELECT * FROM customers WHERE id = ?', [cal?.customer_id ?? ''])
  const { data: visits } = useRows<Visit>('SELECT * FROM visits WHERE id = ?', [cal?.visit_id ?? ''])
  const { data: orgs } = useRows<{ name: string }>('SELECT name FROM organizations WHERE id = ?', [cal?.org_id ?? ''])
  const { data: points } = useRows<CalibrationPoint & { id: string }>('SELECT * FROM calibration_points WHERE calibration_id = ? ORDER BY section, seq', [id])
  const { data: allStd } = useRows<ReferenceStandard & { id: string }>('SELECT * FROM reference_standards')
  if (!cal || !eq) return null
  const cust = custs[0]
  const visit = visits[0]
  const frame = frames[0]
  const tol = num(cal.tolerance_pct) ?? DEFAULT_TOLERANCE_PCT
  const usedIds: string[] = (() => { try { return JSON.parse(cal.standards_used || '[]') } catch { return [] } })()
  // Completed calibrations show the standards as they were at completion (traceability)
  const snapshot: StandardSnapshot[] | null = (() => {
    if (cal.status !== 'completed' || !cal.standards_snapshot) return null
    try { return JSON.parse(cal.standards_snapshot) } catch { return null }
  })()
  const used: { id: string; name: string | null; serial_number: string | null; certificate_number: string | null; due_at: string | null }[] =
    snapshot ?? allStd.filter((s) => usedIds.includes(s.id))

  const instrument: [string, string | null | undefined][] =
    eq.equipment_type === 'crosshead'
      ? [['Type', 'Crosshead'], ['Machine model', eq.model], ['Machine SN', eq.serial_number], ['Indicating device', joinNonEmpty([eq.indicator_model, eq.indicator_serial && `SN ${eq.indicator_serial}`], ' ')]]
      : eq.equipment_type === 'load_cell'
        ? [['Type', 'Load cell'], ['Device model', eq.model], ['Device SN', eq.serial_number], ['Capacity', eq.capacity ? `${eq.capacity} ${eq.units ?? ''}` : null], ['Test frame', frame ? joinNonEmpty([frame.model, frame.serial_number && `SN ${frame.serial_number}`], ' ') : null]]
        : [['Type', typeLabel(eq.equipment_type)], ['Device model', eq.model], ['Device SN', eq.serial_number], ['Gauge length', eq.gauge_length ? `${eq.gauge_length} ${eq.gauge_length_units ?? ''}` : null]]

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Button variant="ghost" onClick={() => nav(`/calibrations/${id}`)}><ChevronLeft size={16} />Back to calibration</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}><Printer size={15} />Print</Button>
          {desktop()?.printToPDF && <Button onClick={() => desktop()!.printToPDF(cal.certificate_number || 'certificate')}><Download size={15} />Save PDF</Button>}
        </div>
      </div>
      {cal.status !== 'completed' && <p className="no-print mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">This calibration is still a draft — the certificate is marked DRAFT until it is completed.</p>}

      <div className="print-page relative mx-auto max-w-[8.5in] rounded-xl border border-slate-200 bg-white p-10 text-[13px] text-slate-800 shadow-sm">
        {cal.status !== 'completed' && <div className="pointer-events-none absolute inset-0 flex -rotate-12 items-center justify-center text-8xl font-bold text-slate-100">DRAFT</div>}
        <div className="relative">
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
            <div>
              <div className="text-xl font-bold">{orgs[0]?.name ?? 'Calibration Laboratory'}</div>
              <div className="text-slate-500">Certificate of Calibration</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase text-slate-500">Certificate No.</div>
              <div className="font-mono text-base font-semibold">{cal.certificate_number}</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-8">
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</h3>
              <div className="font-medium">{cust?.name}</div>
              <div>{cust?.address_line1}</div>
              <div>{joinNonEmpty([cust?.city, joinNonEmpty([cust?.state, cust?.postal_code], ' ')])}</div>
              <div className="text-slate-600">Location: {visit?.location || cust?.location || 'Test Lab'}</div>
              {cust?.contact_name && <div className="mt-1 text-slate-600">Contact: {joinNonEmpty([cust.contact_name, cust.phone, cust.email], ' · ')}</div>}
            </section>
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Instrument</h3>
              <table className="w-full"><tbody>
                {instrument.map(([k, v]) => (<tr key={k}><td className="w-32 py-0.5 text-slate-500">{k}</td><td className="py-0.5">{v || '—'}</td></tr>))}
              </tbody></table>
            </section>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-4 rounded-lg bg-slate-50 p-3">
            {[['Calibration date', fmtDate(cal.performed_at)], ['Due date', fmtDate(cal.due_at)], ['Tolerance', `± ${tol}%`], ['Result', (cal.result ?? '—').toUpperCase()],
              ['Procedure', cal.procedure || '—'], ['Temperature', cal.temperature_c ? `${cal.temperature_c} °C` : '—'], ['Humidity', cal.humidity_pct ? `${cal.humidity_pct} %RH` : '—'], ['Technician', cal.technician_name || '—']].map(([k, v]) => (
              <div key={k}><div className="text-xs text-slate-500">{k}</div><div className="font-semibold">{v}</div></div>
            ))}
          </div>

          {sectionsOf(cal, eq).map((s) => {
            const rows = points.filter((p) => p.section === s.key && (p.nominal || p.run1 || p.run2 || p.run1_time || p.run2_time))
            const u = s.units ? ` (${s.units})` : ''
            return (
              <div key={s.key}>
                <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.title}</h3>
                <table className="w-full border-collapse text-[12px]">
                  <thead><tr className="border-y border-slate-300 bg-slate-50 text-left">
                    {['#', `${s.appliedLabel}${u}`, s.kind === 'speed' ? `Run 1 speed${u}` : `Run 1${u}`, 'Run 1 % error', '', s.kind === 'speed' ? `Run 2 speed${u}` : `Run 2${u}`, 'Run 2 % error', '', 'Run 1 − Run 2 (%)'].map((h, i) => <th key={i} className="px-2 py-1.5 font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((p) => {
                      const r = evaluateRow(p, s.kind)
                      return (
                        <tr key={p.id} className="border-b border-slate-200">
                          <td className="px-2 py-1">{p.seq}</td>
                          <td className="px-2 py-1">{p.nominal ?? '—'}</td>
                          <td className="px-2 py-1">{s.kind === 'speed' ? fmtNum(r.r1) || '—' : p.run1 ?? '—'}</td>
                          <td className="px-2 py-1">{fmtPct(r.e1) || '—'}</td>
                          <td className="px-2 py-1 font-medium">{pf(withinTolerance(r.e1, tol))}</td>
                          <td className="px-2 py-1">{s.kind === 'speed' ? fmtNum(r.r2) || '—' : p.run2 ?? '—'}</td>
                          <td className="px-2 py-1">{fmtPct(r.e2) || '—'}</td>
                          <td className="px-2 py-1 font-medium">{pf(withinTolerance(r.e2, tol))}</td>
                          <td className="px-2 py-1">{fmtPct(r.diff) || '—'}</td>
                        </tr>
                      )
                    })}
                    {rows.length === 0 && <tr><td colSpan={9} className="px-2 py-2 text-slate-500">No readings recorded.</td></tr>}
                  </tbody>
                </table>
              </div>
            )
          })}

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Reference standards (traceability)</h3>
          {used.length === 0 ? <p className="text-slate-500">None recorded.</p> : (
            <table className="w-full text-[12px]"><tbody>
              {used.map((s) => (
                <tr key={s.id} className="border-b border-slate-200">
                  <td className="py-1 pr-2 font-medium">{s.name}</td><td className="py-1 pr-2">S/N {s.serial_number || '—'}</td>
                  <td className="py-1 pr-2">Cert {s.certificate_number || '—'}</td><td className="py-1">Due {fmtDate(s.due_at)}</td>
                </tr>
              ))}
            </tbody></table>
          )}

          {cal.notes && (<><h3 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Remarks</h3><p className="whitespace-pre-wrap">{cal.notes}</p></>)}

          <div className="mt-12 grid grid-cols-2 gap-12">
            <div className="border-t border-slate-400 pt-1 text-xs text-slate-500">Calibrated by: {cal.technician_name}</div>
            <div className="border-t border-slate-400 pt-1 text-xs text-slate-500">Approved by</div>
          </div>
        </div>
      </div>
    </div>
  )
}
