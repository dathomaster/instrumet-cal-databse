import { useParams, useNavigate } from 'react-router-dom'
import { useRows } from '@/lib/useRows'
import { ChevronLeft, Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui'
import { fmtDate, joinNonEmpty } from '@/lib/format'
import { judge, limits, type PointLike } from '@/lib/calibration'
import type { Calibration, CalibrationPoint, Customer, Equipment, ReferenceStandard } from '@/powersync/AppSchema'

import '@/lib/desktop'
import type { StandardSnapshot } from '@/lib/calibrationActions'

const label = (r: string | null) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : '—')

export function Certificate() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: cals } = useRows<Calibration & { id: string }>('SELECT * FROM calibrations WHERE id = ?', [id])
  const cal = cals[0]
  const { data: eqs } = useRows<Equipment>('SELECT * FROM equipment WHERE id = ?', [cal?.equipment_id ?? ''])
  const { data: custs } = useRows<Customer>('SELECT * FROM customers WHERE id = ?', [cal?.customer_id ?? ''])
  const { data: orgs } = useRows<{ name: string }>('SELECT name FROM organizations WHERE id = ?', [cal?.org_id ?? ''])
  const { data: points } = useRows<CalibrationPoint & { id: string }>('SELECT * FROM calibration_points WHERE calibration_id = ? ORDER BY seq, created_at', [id])
  const { data: allStd } = useRows<ReferenceStandard & { id: string }>('SELECT * FROM reference_standards')
  if (!cal) return null
  const eq = eqs[0]
  const cust = custs[0]
  const usedIds: string[] = (() => { try { return JSON.parse(cal.standards_used || '[]') } catch { return [] } })()
  // Completed calibrations show the standards exactly as they were when the
  // calibration was completed (traceability); drafts show the live records.
  const snapshot: StandardSnapshot[] | null = (() => {
    if (cal.status !== 'completed' || !cal.standards_snapshot) return null
    try { return JSON.parse(cal.standards_snapshot) } catch { return null }
  })()
  const used: { id: string; name: string | null; serial_number: string | null; certificate_number: string | null; due_at: string | null }[] =
    snapshot ?? allStd.filter((s) => usedIds.includes(s.id))

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Button variant="ghost" onClick={() => nav(`/calibrations/${id}`)}><ChevronLeft size={16} />Back to calibration</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}><Printer size={15} />Print</Button>
          {window.desktop?.printToPDF && <Button onClick={() => window.desktop!.printToPDF(cal.certificate_number || 'certificate')}><Download size={15} />Save PDF</Button>}
        </div>
      </div>
      {cal.status !== 'completed' && <p className="no-print mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">This calibration is still a draft — the certificate is marked DRAFT until it is completed.</p>}

      <div className="print-page relative mx-auto max-w-[8.5in] rounded-xl border border-slate-200 bg-white p-10 text-[13px] text-slate-800 shadow-sm">
        {cal.status !== 'completed' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-bold text-slate-100 -rotate-12">DRAFT</div>}
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
              <div>{joinNonEmpty([cust?.address_line1, cust?.address_line2])}</div>
              <div>{joinNonEmpty([cust?.city, joinNonEmpty([cust?.state, cust?.postal_code], ' ')])}</div>
            </section>
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Instrument</h3>
              <table className="w-full"><tbody>
                {[
                  ['Description', eq?.description], ['Manufacturer', eq?.manufacturer], ['Model', eq?.model],
                  ['Serial No.', eq?.serial_number], ['Asset ID', eq?.asset_tag],
                  ['Range', eq?.range_min || eq?.range_max ? `${eq?.range_min ?? ''} – ${eq?.range_max ?? ''} ${eq?.units ?? ''}` : null]
                ].map(([k, v]) => (<tr key={k as string}><td className="w-28 py-0.5 text-slate-500">{k}</td><td className="py-0.5">{v || '—'}</td></tr>))}
              </tbody></table>
            </section>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-4 rounded-lg bg-slate-50 p-3">
            {[['Calibration date', fmtDate(cal.performed_at)], ['Due date', fmtDate(cal.due_at)], ['As found', label(cal.as_found_result)], ['As left', label(cal.as_left_result)]].map(([k, v]) => (
              <div key={k}><div className="text-xs text-slate-500">{k}</div><div className="font-semibold">{v}</div></div>
            ))}
            <div><div className="text-xs text-slate-500">Procedure</div><div>{cal.procedure || '—'}</div></div>
            <div><div className="text-xs text-slate-500">Temperature</div><div>{cal.temperature_c ? `${cal.temperature_c} °C` : '—'}</div></div>
            <div><div className="text-xs text-slate-500">Humidity</div><div>{cal.humidity_pct ? `${cal.humidity_pct} %RH` : '—'}</div></div>
            <div><div className="text-xs text-slate-500">Technician</div><div>{cal.technician_name || '—'}</div></div>
          </div>

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Measurement results</h3>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="border-y border-slate-300 bg-slate-50 text-left">
              {['#', 'Parameter', 'Nominal', 'Lower limit', 'Upper limit', 'As found', '', 'As left', ''].map((h, i) => <th key={i} className="px-2 py-1.5 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {points.map((p, i) => {
                const l = limits(p as PointLike)
                return (
                  <tr key={p.id} className="border-b border-slate-200">
                    <td className="px-2 py-1">{i + 1}</td>
                    <td className="px-2 py-1">{p.parameter}</td>
                    <td className="px-2 py-1">{p.nominal} {p.units}</td>
                    <td className="px-2 py-1">{l ? +l.low.toPrecision(8) : '—'}</td>
                    <td className="px-2 py-1">{l ? +l.high.toPrecision(8) : '—'}</td>
                    <td className="px-2 py-1">{p.as_found ?? '—'}</td>
                    <td className="px-2 py-1 font-medium">{label(judge(p.as_found, p as PointLike))}</td>
                    <td className="px-2 py-1">{p.as_left ?? p.as_found ?? '—'}</td>
                    <td className="px-2 py-1 font-medium">{label(judge(p.as_left ?? p.as_found, p as PointLike))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

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
