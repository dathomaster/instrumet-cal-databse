/**
 * CSV export of one calibration: a header block with everything about the job
 * (customer, contact, visit, equipment, standards, conditions, result), then one
 * table per sheet with both runs, % errors, run difference and pass/fail.
 * Pure function — unit-tested in tests/unit/csv.test.ts.
 */
import { dateOnly } from './format'
import { evaluateRow, fmtNum, fmtPct, typeLabel, withinTolerance, type RowValues, type SectionDef } from './sheets'

type Val = string | number | null | undefined

export interface CsvInput {
  org?: { name?: string | null } | null
  customer: {
    name?: string | null
    address_line1?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    contact_name?: string | null
    phone?: string | null
    email?: string | null
  }
  visit: { visit_date?: string | null; location?: string | null; technician_name?: string | null }
  calibration: {
    certificate_number?: string | null
    performed_at?: string | null
    due_at?: string | null
    technician_name?: string | null
    status?: string | null
    result?: string | null
    tolerance_pct?: Val
    procedure?: string | null
    temperature_c?: Val
    humidity_pct?: Val
    notes?: string | null
  }
  equipment: {
    equipment_type?: string | null
    model?: string | null
    serial_number?: string | null
    manufacturer?: string | null
    asset_tag?: string | null
    capacity?: Val
    units?: string | null
    indicator_model?: string | null
    indicator_serial?: string | null
    gauge_length?: Val
    gauge_length_units?: string | null
  }
  testFrame?: { model?: string | null; serial_number?: string | null } | null
  standards: { name?: string | null; serial_number?: string | null; certificate_number?: string | null; due_at?: string | null }[]
  sections: SectionDef[]
  rows: (RowValues & { section?: string | null; seq?: number | null })[]
}

/** RFC 4180 field quoting: wrap in quotes when needed, double embedded quotes. */
export function csvField(v: Val): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const line = (cells: Val[]) => cells.map(csvField).join(',')

const hasData = (r: RowValues) =>
  [r.nominal, r.run1, r.run2, r.run1_time, r.run1_distance, r.run2_time, r.run2_distance].some((v) => v !== null && v !== undefined && v !== '')

export function buildCalibrationCsv(d: CsvInput): string {
  const tol = Number(d.calibration.tolerance_pct ?? 1) || 0
  const e = d.equipment
  const out: string[] = []
  const kv = (k: string, v: Val) => out.push(line([k, v]))

  kv('Calibration report', d.org?.name ?? '')
  kv('Certificate number', d.calibration.certificate_number)
  kv('Status', d.calibration.status)
  kv('Result', d.calibration.result ? d.calibration.result.toUpperCase() : '')
  kv('Tolerance (±%)', tol)
  out.push('')
  kv('Company', d.customer.name)
  kv('Street', d.customer.address_line1)
  kv('City', d.customer.city)
  kv('State', d.customer.state)
  kv('ZIP', d.customer.postal_code)
  kv('Location', d.visit.location)
  kv('Contact name', d.customer.contact_name)
  kv('Contact phone', d.customer.phone)
  kv('Contact email', d.customer.email)
  out.push('')
  kv('Visit date', dateOnly(d.visit.visit_date))
  kv('Calibration date', dateOnly(d.calibration.performed_at))
  kv('Next due', dateOnly(d.calibration.due_at))
  kv('Technician', d.calibration.technician_name || d.visit.technician_name)
  kv('Procedure', d.calibration.procedure)
  kv('Temperature (°C)', d.calibration.temperature_c)
  kv('Humidity (%RH)', d.calibration.humidity_pct)
  out.push('')
  kv('Equipment type', typeLabel(e.equipment_type))
  if (e.equipment_type === 'crosshead') {
    kv('Machine model', e.model)
    kv('Machine SN', e.serial_number)
    kv('Indicating device model', e.indicator_model)
    kv('Indicating device SN', e.indicator_serial)
  } else {
    kv('Device model', e.model)
    kv('Device SN', e.serial_number)
  }
  if (e.manufacturer) kv('Manufacturer', e.manufacturer)
  if (e.asset_tag) kv('Asset tag', e.asset_tag)
  if (e.equipment_type === 'load_cell') {
    kv('Capacity', [e.capacity, e.units].filter((x) => x !== null && x !== undefined && x !== '').join(' '))
    kv('Test frame', d.testFrame ? [d.testFrame.model, d.testFrame.serial_number && `SN ${d.testFrame.serial_number}`].filter(Boolean).join(' ') : '')
  }
  if (e.equipment_type === 'extensometer') kv('Gauge length', [e.gauge_length, e.gauge_length_units].filter((x) => x !== null && x !== undefined && x !== '').join(' '))
  out.push('')
  out.push(line(['Reference standards', 'Serial number', 'Certificate', 'Due']))
  for (const s of d.standards) out.push(line([s.name, s.serial_number, s.certificate_number, dateOnly(s.due_at)]))
  if (!d.standards.length) out.push(line(['(none recorded)']))

  for (const s of d.sections) {
    out.push('')
    out.push(line([s.title]))
    const u = s.units ? ` (${s.units})` : ''
    if (s.kind === 'speed') {
      const lu = s.lengthUnits ? ` (${s.lengthUnits})` : ''
      out.push(line(['#', `Target speed${u}`, 'Run 1 time (s)', `Run 1 distance${lu}`, `Run 1 speed${u}`, 'Run 1 % error', 'Run 2 time (s)', `Run 2 distance${lu}`, `Run 2 speed${u}`, 'Run 2 % error', 'Run 1 − Run 2 (%)', 'Run 1 pass/fail', 'Run 2 pass/fail']))
    } else {
      out.push(line(['#', `${s.appliedLabel}${u}`, `Run 1 ${s.readingLabel.toLowerCase()}${u}`, 'Run 1 % error', `Run 2 ${s.readingLabel.toLowerCase()}${u}`, 'Run 2 % error', 'Run 1 − Run 2 (%)', 'Run 1 pass/fail', 'Run 2 pass/fail']))
    }
    const rows = d.rows.filter((r) => (r.section ?? 'main') === s.key && hasData(r)).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    for (const r of rows) {
      const ev = evaluateRow(r, s.kind)
      const pf = (x: number | null) => {
        const ok = withinTolerance(x, tol)
        return ok === null ? '' : ok ? 'PASS' : 'FAIL'
      }
      out.push(
        s.kind === 'speed'
          ? line([r.seq, r.nominal, r.run1_time, r.run1_distance, fmtNum(ev.r1), fmtPct(ev.e1), r.run2_time, r.run2_distance, fmtNum(ev.r2), fmtPct(ev.e2), fmtPct(ev.diff), pf(ev.e1), pf(ev.e2)])
          : line([r.seq, r.nominal, r.run1, fmtPct(ev.e1), r.run2, fmtPct(ev.e2), fmtPct(ev.diff), pf(ev.e1), pf(ev.e2)])
      )
    }
    if (!rows.length) out.push(line(['(no readings)']))
  }
  if (d.calibration.notes) {
    out.push('')
    kv('Notes', d.calibration.notes)
  }
  // UTF-8 BOM so Excel shows °, ± and − correctly
  return '﻿' + out.join('\r\n') + '\r\n'
}

export function csvFileName(d: Pick<CsvInput, 'customer' | 'equipment' | 'calibration'>): string {
  const parts = [d.customer.name, typeLabel(d.equipment.equipment_type), d.equipment.serial_number, dateOnly(d.calibration.performed_at), d.calibration.certificate_number]
  return parts.filter(Boolean).join('_').replace(/[^\w.-]+/g, '-') + '.csv'
}
