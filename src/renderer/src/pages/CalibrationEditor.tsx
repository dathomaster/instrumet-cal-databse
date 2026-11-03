import { memo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRows } from '@/lib/useRows'
import { CheckCircle2, FileText, Plus, RotateCcw, Trash2, AlertTriangle } from 'lucide-react'
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, cx } from '@/components/ui'
import { BackLink } from '@/components/BackLink'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { AutoInput, AutoTextarea } from '@/components/AutoInput'
import { DueBadge, ResultBadge } from '@/components/DueBadge'
import { deleteRow, updateRow } from '@/lib/data'
import { dateOnly, dueState, fmtDate, nowISO, todayISO } from '@/lib/format'
import { judge, limits, overallAsFound, overallAsLeft, percentOfTolerance, type PointLike } from '@/lib/calibration'
import { completeCalibration, countMissingReadings, deleteCalibration, reopenCalibration } from '@/lib/calibrationActions'
import { db } from '@/powersync/db'
import type { Calibration, CalibrationPoint, Equipment, ReferenceStandard } from '@/powersync/AppSchema'

type Cal = Calibration & { id: string }
type Pt = CalibrationPoint & { id: string }

export function CalibrationEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: cals, isLoading } = useRows<Cal>('SELECT * FROM calibrations WHERE id = ?', [id])
  const cal = cals[0]
  const { data: eqs } = useRows<Equipment & { id: string; customer_name: string }>(
    'SELECT e.*, c.name AS customer_name FROM equipment e JOIN customers c ON c.id = e.customer_id WHERE e.id = ?',
    [cal?.equipment_id ?? '']
  )
  const { data: points } = useRows<Pt>('SELECT * FROM calibration_points WHERE calibration_id = ? ORDER BY seq, created_at', [id])
  const { data: standards } = useRows<ReferenceStandard & { id: string }>('SELECT * FROM reference_standards ORDER BY name COLLATE NOCASE')
  const eq = eqs[0]

  if (!cal) return isLoading ? null : <EmptyState title="Calibration not found">It may have been deleted by another technician.</EmptyState>
  const locked = cal.status === 'completed'
  const used: string[] = (() => { try { return JSON.parse(cal.standards_used || '[]') } catch { return [] } })()
  const foundResult = overallAsFound(points as readonly PointLike[])
  const leftResult = overallAsLeft(points as readonly PointLike[])
  const expiredUsed = standards.filter((s) => used.includes(s.id) && dueState(s.due_at) === 'overdue')

  async function toggleStandard(sid: string) {
    const next = used.includes(sid) ? used.filter((x) => x !== sid) : [...used, sid]
    await updateRow('calibrations', id, { standards_used: JSON.stringify(next) }, { standards_used: cal.standards_used ?? null })
  }

  async function addPoint() {
    const last = points[points.length - 1]
    const now = nowISO()
    await db.execute(
      `INSERT INTO calibration_points (id, org_id, calibration_id, seq, parameter, units, tolerance_minus, tolerance_plus, created_at, updated_at)
       VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cal.org_id, id, (last?.seq ?? 0) + 1, last?.parameter ?? null, last?.units ?? eq?.units ?? null, last?.tolerance_minus ?? null, last?.tolerance_plus ?? null, now, now]
    )
  }

  const C = { table: 'calibrations', rowId: id } as const

  return (
    <>
      <PageHeader
        back={eq ? <BackLink to={`/equipment/${eq.id}`} label={eq.description ?? 'Equipment'} /> : undefined}
        title={
          <span className="flex items-center gap-3">
            Calibration <span className="font-mono text-lg text-slate-500">{cal.certificate_number}</span>
            {locked ? <Badge tone="green"><CheckCircle2 size={12} />Completed</Badge> : <Badge tone="blue">Draft</Badge>}
          </span>
        }
        subtitle={eq ? `${eq.customer_name} · ${eq.description}${eq.serial_number ? ` · S/N ${eq.serial_number}` : ''}` : undefined}
        actions={
          <>
            <ConfirmDelete what="calibration" onConfirm={async () => { await deleteCalibration(id); nav(eq ? `/equipment/${eq.id}` : '/calibrations') }} />
            <Button variant="secondary" onClick={() => nav(`/calibrations/${id}/certificate`)}><FileText size={15} />Certificate</Button>
            {locked ? (
              <Button variant="secondary" onClick={() => reopenCalibration(id)}><RotateCcw size={15} />Reopen to edit</Button>
            ) : (
              <Button onClick={() => {
                const missing = countMissingReadings(points)
                if (missing && !confirm(`${missing} measurement point${missing === 1 ? ' has' : 's have'} no as-found reading. Complete anyway?`)) return
                completeCalibration(id)
              }} disabled={!eq || points.length === 0} title={points.length === 0 ? 'Add at least one measurement point' : undefined}>
                <CheckCircle2 size={16} />Complete calibration
              </Button>
            )}
          </>
        }
      />

      {locked && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={16} />
          Completed {fmtDate(cal.performed_at)}. Next due {fmtDate(cal.due_at)}. Spotted a mistake? Reopen it, correct it, and complete again — the fix syncs to everyone.
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Calibration details" />
          <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
            <Field label="Date performed"><AutoInput {...C} field="performed_at" value={dateOnly(cal.performed_at) || todayISO()} type="date" boxed disabled={locked} required /></Field>
            <Field label="Due date (blank = by interval)"><AutoInput {...C} field="due_at" value={dateOnly(cal.due_at)} type="date" boxed disabled={locked} /></Field>
            <Field label="Technician"><AutoInput {...C} field="technician_name" value={cal.technician_name} boxed disabled={locked} /></Field>
            <Field label="Procedure" className="col-span-2 md:col-span-1"><AutoInput {...C} field="procedure" value={cal.procedure} placeholder="e.g. SOP-PR-001 rev C" boxed disabled={locked} /></Field>
            <Field label="Temperature (°C)"><AutoInput {...C} field="temperature_c" value={cal.temperature_c} type="number" step="any" boxed disabled={locked} /></Field>
            <Field label="Humidity (%RH)"><AutoInput {...C} field="humidity_pct" value={cal.humidity_pct} type="number" step="any" boxed disabled={locked} /></Field>
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

      <Card>
        <CardHeader
          title="Measurements"
          subtitle="Pass/fail is calculated from nominal ± tolerance"
          actions={
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">As found <ResultBadge result={foundResult} /></span>
              <span className="flex items-center gap-1.5">As left <ResultBadge result={leftResult} /></span>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm" data-testid="points-table">
            <thead className="bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-3 py-2.5 text-left">#</th>
                <th className="px-1 py-2.5 text-left">Parameter</th>
                <th className="w-20 px-1 py-2.5 text-left">Units</th>
                <th className="w-24 px-1 py-2.5 text-left">Nominal</th>
                <th className="w-20 px-1 py-2.5 text-left">Tol −</th>
                <th className="w-20 px-1 py-2.5 text-left">Tol +</th>
                <th className="w-28 px-1 py-2.5 text-left">Limits</th>
                <th className="w-24 px-1 py-2.5 text-left">As found</th>
                <th className="w-16 px-1 py-2.5 text-left"></th>
                <th className="w-24 px-1 py-2.5 text-left">As left</th>
                <th className="w-16 px-1 py-2.5 text-left"></th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {points.map((p, i) => <PointRow key={p.id} p={p} index={i} locked={locked} />)}
            </tbody>
          </table>
        </div>
        {!locked && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Button variant="secondary" size="sm" onClick={addPoint}><Plus size={14} />Add measurement point</Button>
          </div>
        )}
        {points.length === 0 && locked && <EmptyState title="No measurements recorded" />}
      </Card>
    </>
  )
}

const P = { table: 'calibration_points' } as const

/**
 * One measurement point. Memoized: while a technician types in one row (or a
 * sync updates another), the other rows don't re-render.
 */
const PointRow = memo(function PointRow({ p, index: i, locked }: { p: Pt; index: number; locked: boolean }) {
  const l = limits(p as PointLike)
  const f = judge(p.as_found, p as PointLike)
  const a = judge(p.as_left, p as PointLike)
  const pf = percentOfTolerance(p.as_found, p as PointLike)
  const pa = percentOfTolerance(p.as_left, p as PointLike)
  const cell = (field: keyof Pt, extra: Record<string, unknown> = {}) => (
    <AutoInput {...P} rowId={p.id} field={field as string} value={p[field] as string} disabled={locked} {...extra} />
  )
  return (
    <tr className="group">
      <td className="px-3 py-1 text-xs text-slate-400">{i + 1}</td>
      <td className="px-1 py-1">{cell('parameter', { placeholder: 'e.g. Pressure' })}</td>
      <td className="px-1 py-1">{cell('units')}</td>
      <td className="px-1 py-1">{cell('nominal', { type: 'number', step: 'any' })}</td>
      <td className="px-1 py-1">{cell('tolerance_minus', { type: 'number', step: 'any', min: 0 })}</td>
      <td className="px-1 py-1">{cell('tolerance_plus', { type: 'number', step: 'any', min: 0, placeholder: '= tol −' })}</td>
      <td className="px-1 py-1 font-mono text-xs text-slate-500">{l ? `${+l.low.toPrecision(8)} … ${+l.high.toPrecision(8)}` : '—'}</td>
      <td className="px-1 py-1">{cell('as_found', { type: 'number', step: 'any', className: f === 'fail' ? 'text-red-700 font-medium' : undefined })}</td>
      <td className="px-1 py-1" title={pf !== null ? `${pf.toFixed(1)}% of tolerance` : undefined}><ResultBadge result={f} /></td>
      <td className="px-1 py-1">{cell('as_left', { type: 'number', step: 'any', placeholder: 'same', className: a === 'fail' ? 'text-red-700 font-medium' : undefined })}</td>
      <td className="px-1 py-1" title={pa !== null ? `${pa.toFixed(1)}% of tolerance` : undefined}>{p.as_left ? <ResultBadge result={a} /> : null}</td>
      <td className="px-1 py-1 text-right">
        {!locked && (
          <button onClick={() => deleteRow('calibration_points', p.id)} className="rounded p-1.5 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" aria-label="Delete point">
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  )
})
