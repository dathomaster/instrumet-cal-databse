import { memo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react'
import { useRows } from '@/lib/useRows'
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, cx } from '@/components/ui'
import { BackLink } from '@/components/BackLink'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { AutoInput, AutoTextarea } from '@/components/AutoInput'
import { DueBadge, ResultBadge } from '@/components/DueBadge'
import { updateRow } from '@/lib/data'
import { dateOnly, dueState, fmtDate, num, todayISO } from '@/lib/format'
import { completeCalibration, countIncomplete, deleteCalibration, reopenCalibration, sectionsOf } from '@/lib/calibrationActions'
import { DEFAULT_TOLERANCE_PCT, equipmentLabel, evaluateRow, fmtNum, fmtPct, overallResult, typeLabel, withinTolerance, type SectionDef } from '@/lib/sheets'
import { exportCalibrationCsv } from '@/lib/exportCsv'
import { db } from '@/powersync/db'
import type { Calibration, CalibrationPoint, Equipment, ReferenceStandard } from '@/powersync/AppSchema'

type Cal = Calibration & { id: string }
type Pt = CalibrationPoint & { id: string }

export function CalibrationEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [saved, setSaved] = useState<string | null>(null)
  const { data: cals, isLoading } = useRows<Cal>('SELECT * FROM calibrations WHERE id = ?', [id])
  const cal = cals[0]
  const { data: eqs } = useRows<Equipment & { id: string; customer_name: string }>(
    'SELECT e.*, c.name AS customer_name FROM equipment e JOIN customers c ON c.id = e.customer_id WHERE e.id = ?',
    [cal?.equipment_id ?? '']
  )
  const eq = eqs[0]
  const { data: points } = useRows<Pt>('SELECT * FROM calibration_points WHERE calibration_id = ? ORDER BY section, seq', [id])
  const { data: standards } = useRows<ReferenceStandard & { id: string }>('SELECT * FROM reference_standards ORDER BY name COLLATE NOCASE')

  if (!cal) return isLoading ? null : <EmptyState title="Calibration not found">It may have been deleted by another technician.</EmptyState>
  const locked = cal.status === 'completed'
  const sections = eq ? sectionsOf(cal, eq) : []
  const tol = num(cal.tolerance_pct) ?? DEFAULT_TOLERANCE_PCT
  const live = overallResult(points, sections, tol)
  const used: string[] = (() => { try { return JSON.parse(cal.standards_used || '[]') } catch { return [] } })()
  const expiredUsed = standards.filter((s) => used.includes(s.id) && dueState(s.due_at) === 'overdue')

  async function toggleStandard(sid: string) {
    const next = used.includes(sid) ? used.filter((x) => x !== sid) : [...used, sid]
    await updateRow('calibrations', id, { standards_used: JSON.stringify(next) }, { standards_used: cal.standards_used ?? null })
  }

  async function complete() {
    // Clicking "Complete" right after typing in a cell: that cell's save is still
    // queued. Reading through the write queue sees it, so the checks below use the
    // value just typed rather than what was on screen a moment ago.
    await new Promise((r) => setTimeout(r, 0))
    const rows = await db.writeTransaction((tx) => tx.getAll<Pt>('SELECT * FROM calibration_points WHERE calibration_id = ?', [id]))
    if (overallResult(rows, sections, tol) === null) return alert('Enter at least one applied value with a reading before completing.')
    const missing = countIncomplete(rows, sections)
    if (missing && !confirm(`${missing} line${missing === 1 ? ' has' : 's have'} an applied value but a missing run. Complete anyway?`)) return
    await completeCalibration(id)
  }

  async function exportCsv() {
    const r = await exportCalibrationCsv(id)
    if (r.ok) setSaved(r.filePath ?? 'CSV saved')
  }

  const C = { table: 'calibrations', rowId: id } as const

  return (
    <>
      <PageHeader
        back={<BackLink to={`/visits/${cal.visit_id}`} label="Visit" />}
        title={
          <span className="flex items-center gap-3">
            {typeLabel(eq?.equipment_type)} calibration <span className="font-mono text-lg text-slate-500">{cal.certificate_number}</span>
            {locked ? <Badge tone="green"><CheckCircle2 size={12} />Completed</Badge> : <Badge tone="blue">Draft</Badge>}
          </span>
        }
        subtitle={eq ? `${eq.customer_name} · ${equipmentLabel(eq)}` : undefined}
        actions={
          <>
            <ConfirmDelete what="calibration" onConfirm={async () => { await deleteCalibration(id); nav(`/visits/${cal.visit_id}`) }} />
            <Button variant="secondary" onClick={exportCsv}><FileSpreadsheet size={15} />Save CSV</Button>
            <Button variant="secondary" onClick={() => nav(`/calibrations/${id}/certificate`)}><FileText size={15} />Certificate</Button>
            {locked ? (
              <Button variant="secondary" onClick={() => reopenCalibration(id)}><RotateCcw size={15} />Reopen to edit</Button>
            ) : (
              <Button onClick={complete}><CheckCircle2 size={16} />Complete calibration</Button>
            )}
          </>
        }
      />

      {saved && <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800" data-testid="csv-saved">Saved {saved}</div>}
      {locked && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={16} />
          Completed {fmtDate(cal.performed_at)} · Result <ResultBadge result={cal.result} /> · Next due {fmtDate(cal.due_at)}. Spotted a mistake? Reopen it, correct it, and complete again.
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Calibration details" actions={eq && <Link to={`/equipment/${eq.id}`} className="text-xs font-medium text-brand-700 hover:underline">Equipment details</Link>} />
          <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
            <Field label="Date performed"><AutoInput {...C} field="performed_at" value={dateOnly(cal.performed_at) || todayISO()} type="date" boxed disabled={locked} required /></Field>
            <Field label="Due date (blank = by interval)"><AutoInput {...C} field="due_at" value={dateOnly(cal.due_at)} type="date" boxed disabled={locked} /></Field>
            <Field label="Tolerance (± %)"><AutoInput {...C} field="tolerance_pct" value={cal.tolerance_pct} type="number" step="any" min={0} boxed disabled={locked} required /></Field>
            <Field label="Technician"><AutoInput {...C} field="technician_name" value={cal.technician_name} boxed disabled={locked} /></Field>
            <Field label="Procedure"><AutoInput {...C} field="procedure" value={cal.procedure} placeholder="e.g. ASTM E4" boxed disabled={locked} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Temp (°C)"><AutoInput {...C} field="temperature_c" value={cal.temperature_c} type="number" step="any" boxed disabled={locked} /></Field>
              <Field label="Humidity (%RH)"><AutoInput {...C} field="humidity_pct" value={cal.humidity_pct} type="number" step="any" boxed disabled={locked} /></Field>
            </div>
            <Field label="Notes" className="col-span-2 md:col-span-3"><AutoTextarea {...C} field="notes" value={cal.notes} disabled={locked} placeholder="Adjustments made, observations, condition as received…" /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Reference standards used" subtitle="Traceability" />
          <div className="max-h-72 space-y-1 overflow-y-auto p-3">
            {standards.length === 0 && (
              <p className="p-2 text-sm text-slate-500">No reference standards yet. <Link to="/standards" className="text-brand-700 hover:underline">Add your test equipment</Link>.</p>
            )}
            {standards.map((s) => (
              <label key={s.id} className={cx('flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50', locked && 'pointer-events-none')}>
                <input type="checkbox" className="mt-0.5 accent-brand-600" checked={used.includes(s.id)} onChange={() => toggleStandard(s.id)} disabled={locked} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{s.name}</span>
                  <span className="block truncate text-xs text-slate-500">{[s.serial_number && `S/N ${s.serial_number}`, s.certificate_number && `Cert ${s.certificate_number}`].filter(Boolean).join(' · ')}</span>
                </span>
                {s.due_at && <DueBadge date={s.due_at} />}
              </label>
            ))}
          </div>
          {expiredUsed.length > 0 && (
            <p className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs text-red-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {expiredUsed.map((s) => s.name).join(', ')} {expiredUsed.length === 1 ? 'is' : 'are'} past due for calibration.
            </p>
          )}
        </Card>
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        Result so far (±{tol}%): <ResultBadge result={live} />
      </div>
      {sections.map((s) => (
        <SheetCard key={s.key} section={s} rows={points.filter((p) => p.section === s.key)} tol={tol} locked={locked} />
      ))}
      {eq && sections.length === 0 && <EmptyState title="No sheets for this equipment type" />}
    </>
  )
}

function SheetCard({ section: s, rows, tol, locked }: { section: SectionDef; rows: Pt[]; tol: number; locked: boolean }) {
  const res = overallResult(rows, [s], tol)
  const u = s.units ? ` (${s.units})` : ''
  return (
    <Card className="mb-6">
      <CardHeader title={s.title} subtitle={`${rows.length} lines · 2 runs`} actions={<ResultBadge result={res} />} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm" data-testid={`sheet-${s.key}`}>
          <thead className="bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-500">
            {s.kind === 'speed' ? (
              <tr>
                <th className="w-8 px-3 py-2.5 text-left">#</th>
                <th className="px-1 py-2.5 text-left">{s.appliedLabel}{u}</th>
                <th className="px-1 py-2.5 text-left">R1 time (s)</th>
                <th className="px-1 py-2.5 text-left">R1 distance{s.lengthUnits ? ` (${s.lengthUnits})` : ''}</th>
                <th className="px-1 py-2.5 text-left">R1 speed</th>
                <th className="px-1 py-2.5 text-left">R1 % err</th>
                <th className="px-1 py-2.5 text-left">R2 time (s)</th>
                <th className="px-1 py-2.5 text-left">R2 distance{s.lengthUnits ? ` (${s.lengthUnits})` : ''}</th>
                <th className="px-1 py-2.5 text-left">R2 speed</th>
                <th className="px-1 py-2.5 text-left">R2 % err</th>
                <th className="px-1 py-2.5 text-left">R1 − R2 (%)</th>
              </tr>
            ) : (
              <tr>
                <th className="w-8 px-3 py-2.5 text-left">#</th>
                <th className="px-1 py-2.5 text-left">{s.appliedLabel}{u}</th>
                <th className="px-1 py-2.5 text-left">Run 1 {s.readingLabel.toLowerCase()}</th>
                <th className="w-24 px-1 py-2.5 text-left">Run 1 % err</th>
                <th className="px-1 py-2.5 text-left">Run 2 {s.readingLabel.toLowerCase()}</th>
                <th className="w-24 px-1 py-2.5 text-left">Run 2 % err</th>
                <th className="w-28 px-1 py-2.5 text-left">Run 1 − Run 2 (%)</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => <SheetRow key={p.id} p={p} kind={s.kind} tol={tol} locked={locked} />)}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const P = { table: 'calibration_points' } as const

/** % error cell, green within tolerance, red outside. */
function Err({ v, tol, testid }: { v: number | null; tol: number; testid: string }) {
  const ok = withinTolerance(v, tol)
  return (
    <span data-testid={testid} className={cx('inline-block min-w-14 rounded px-1.5 py-0.5 text-right font-mono text-xs', ok === null ? 'text-slate-300' : ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 font-semibold text-red-700')}>
      {v === null ? '—' : fmtPct(v)}
    </span>
  )
}

/** One sheet line. Memoized: typing in one line (or a sync updating another)
 *  doesn't re-render the rest of the sheet. */
const SheetRow = memo(function SheetRow({ p, kind, tol, locked }: { p: Pt; kind: SectionDef['kind']; tol: number; locked: boolean }) {
  const r = evaluateRow(p, kind)
  const tid = (f: string) => `cell-${p.section}-${p.seq}-${f}`
  const cell = (field: keyof Pt, extra: Record<string, unknown> = {}) => (
    <AutoInput {...P} rowId={p.id} field={field as string} value={p[field] as string} type="number" step="any" disabled={locked} data-testid={tid(field as string)} aria-label={`${field} line ${p.seq}`} {...extra} />
  )
  if (kind === 'speed') {
    return (
      <tr>
        <td className="px-3 py-1 text-xs text-slate-400">{p.seq}</td>
        <td className="px-1 py-1">{cell('nominal')}</td>
        <td className="px-1 py-1">{cell('run1_time')}</td>
        <td className="px-1 py-1">{cell('run1_distance')}</td>
        <td className="px-1 py-1 font-mono text-xs text-slate-600" data-testid={tid('speed1')}>{fmtNum(r.r1) || '—'}</td>
        <td className="px-1 py-1"><Err v={r.e1} tol={tol} testid={tid('err1')} /></td>
        <td className="px-1 py-1">{cell('run2_time')}</td>
        <td className="px-1 py-1">{cell('run2_distance')}</td>
        <td className="px-1 py-1 font-mono text-xs text-slate-600" data-testid={tid('speed2')}>{fmtNum(r.r2) || '—'}</td>
        <td className="px-1 py-1"><Err v={r.e2} tol={tol} testid={tid('err2')} /></td>
        <td className="px-1 py-1 font-mono text-xs text-slate-600" data-testid={tid('diff')}>{r.diff === null ? '—' : fmtPct(r.diff)}</td>
      </tr>
    )
  }
  return (
    <tr>
      <td className="px-3 py-1 text-xs text-slate-400">{p.seq}</td>
      <td className="px-1 py-1">{cell('nominal')}</td>
      <td className="px-1 py-1">{cell('run1')}</td>
      <td className="px-1 py-1"><Err v={r.e1} tol={tol} testid={tid('err1')} /></td>
      <td className="px-1 py-1">{cell('run2')}</td>
      <td className="px-1 py-1"><Err v={r.e2} tol={tol} testid={tid('err2')} /></td>
      <td className="px-1 py-1 font-mono text-xs text-slate-600" data-testid={tid('diff')}>{r.diff === null ? '—' : fmtPct(r.diff)}</td>
    </tr>
  )
})
