/**
 * Calibration sheets: which tables a calibration has, and the maths on them.
 * Pure functions (no database / React) so they are unit-tested
 * (tests/unit/sheets.test.ts) and shared by the editor, certificate and CSV.
 */
import { num } from './format'

export type EquipmentType = 'load_cell' | 'extensometer' | 'crosshead'

export const EQUIPMENT_TYPES: { value: EquipmentType; label: string }[] = [
  { value: 'load_cell', label: 'Load cell' },
  { value: 'extensometer', label: 'Extensometer' },
  { value: 'crosshead', label: 'Crosshead' }
]
export const LOAD_UNITS = ['lbf', 'klbf', 'N', 'kN', 'kgf'] as const
export const LENGTH_UNITS = ['in', 'mm'] as const
export const DEFAULT_TOLERANCE_PCT = 1.0

export function typeLabel(t: string | null | undefined): string {
  return EQUIPMENT_TYPES.find((x) => x.value === t)?.label ?? 'Equipment'
}

/** Options chosen when a calibration is started (stored as JSON on the calibration). */
export interface CalConfig {
  modes?: ('tension' | 'compression')[] // load cell
  tests?: ('displacement' | 'speed')[] // crosshead
  directions?: ('up' | 'down')[] // crosshead
  length_units?: 'in' | 'mm' // crosshead: displacement in units, speed in units/min
}

export function parseConfig(json: string | null | undefined): CalConfig {
  try {
    return json ? (JSON.parse(json) as CalConfig) : {}
  } catch {
    return {}
  }
}

/** A "reading" sheet compares a reading against an applied value; a "speed"
 *  sheet derives the actual speed from time and distance. */
export type SheetKind = 'reading' | 'speed'

export interface SectionDef {
  key: string // stored in calibration_points.section
  title: string
  kind: SheetKind
  rows: number
  appliedLabel: string
  readingLabel: string
  units: string // units of the applied/reading values (speed sheets: units/min)
  lengthUnits?: string // speed sheets: distance units
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The sheets a calibration has, from its equipment type and chosen options. */
export function sectionsFor(
  type: string | null | undefined,
  config: CalConfig,
  equipment: { units?: string | null; gauge_length_units?: string | null }
): SectionDef[] {
  if (type === 'load_cell') {
    const units = equipment.units || ''
    return (config.modes?.length ? config.modes : ['tension']).map((m) => ({
      key: m,
      title: cap(m),
      kind: 'reading' as const,
      rows: 20,
      appliedLabel: 'Applied',
      readingLabel: 'Indicated',
      units
    }))
  }
  if (type === 'extensometer') {
    return [{ key: 'main', title: 'Extensometer', kind: 'reading', rows: 20, appliedLabel: 'Device', readingLabel: 'Indicated', units: equipment.gauge_length_units || '' }]
  }
  if (type === 'crosshead') {
    const lu = config.length_units || 'in'
    const tests = config.tests?.length ? config.tests : ['displacement']
    const dirs = config.directions?.length ? config.directions : ['up']
    const out: SectionDef[] = []
    for (const t of tests) {
      for (const d of dirs) {
        out.push(
          t === 'displacement'
            ? { key: `displacement_${d}`, title: `Displacement · ${cap(d)}`, kind: 'reading', rows: 5, appliedLabel: 'Applied displacement', readingLabel: 'Actual displacement', units: lu }
            : { key: `speed_${d}`, title: `Speed · ${cap(d)}`, kind: 'speed', rows: 5, appliedLabel: 'Target speed', readingLabel: 'Speed', units: `${lu}/min`, lengthUnits: lu }
        )
      }
    }
    return out
  }
  return []
}

/** The stored values of one sheet line (all optional text from SQLite). */
export interface RowValues {
  nominal?: string | number | null
  run1?: string | number | null
  run2?: string | number | null
  run1_time?: string | number | null
  run1_distance?: string | number | null
  run2_time?: string | number | null
  run2_distance?: string | number | null
}

/** % error of a reading against the applied/target value. */
export function pctError(reading: number | null, applied: number | null): number | null {
  if (reading === null || applied === null || applied === 0) return null
  return ((reading - applied) / applied) * 100
}

/** Crosshead speed from a timed move: distance ÷ time (seconds), per minute. */
export function speedPerMin(timeSec: number | null, distance: number | null): number | null {
  if (timeSec === null || distance === null || timeSec <= 0) return null
  return (distance / timeSec) * 60
}

export interface RowResult {
  applied: number | null
  r1: number | null // reading (or calculated speed) for run 1
  r2: number | null
  e1: number | null // % error run 1
  e2: number | null
  diff: number | null // run 1 % error − run 2 % error  (= (r1 − r2) ÷ applied × 100)
}

export function evaluateRow(row: RowValues, kind: SheetKind): RowResult {
  const applied = num(row.nominal)
  const r1 = kind === 'speed' ? speedPerMin(num(row.run1_time), num(row.run1_distance)) : num(row.run1)
  const r2 = kind === 'speed' ? speedPerMin(num(row.run2_time), num(row.run2_distance)) : num(row.run2)
  const e1 = pctError(r1, applied)
  const e2 = pctError(r2, applied)
  return { applied, r1, r2, e1, e2, diff: e1 !== null && e2 !== null ? e1 - e2 : null }
}

/** Within tolerance? Tiny epsilon so a reading exactly on the limit isn't failed by float noise. */
export function withinTolerance(err: number | null, tolPct: number): boolean | null {
  if (err === null) return null
  return Math.abs(err) <= Math.abs(tolPct) + 1e-9
}

/** A line has an applied value but a run is missing (warn before completing). */
export function isIncomplete(row: RowValues, kind: SheetKind): boolean {
  if (num(row.nominal) === null) return false
  if (kind === 'speed') return [row.run1_time, row.run1_distance, row.run2_time, row.run2_distance].some((v) => num(v) === null)
  return num(row.run1) === null || num(row.run2) === null
}

/** Overall result: fail if any run of any line is out of tolerance. */
export function overallResult(
  rows: readonly (RowValues & { section?: string | null })[],
  sections: readonly SectionDef[],
  tolPct: number
): 'pass' | 'fail' | null {
  let any = false
  for (const s of sections) {
    for (const r of rows.filter((x) => (x.section ?? 'main') === s.key)) {
      const { e1, e2 } = evaluateRow(r, s.kind)
      for (const e of [e1, e2]) {
        const ok = withinTolerance(e, tolPct)
        if (ok === null) continue
        any = true
        if (!ok) return 'fail'
      }
    }
  }
  return any ? 'pass' : null
}

/** "1.234" style formatting for computed values; '' when missing. */
export function fmtNum(v: number | null, digits = 3): string {
  if (v === null || !Number.isFinite(v)) return ''
  return String(+v.toFixed(digits))
}
export function fmtPct(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '' : v.toFixed(2)
}

/** Short human name for a piece of equipment, e.g. "Load cell · 2580-50kN · SN LC-1". */
export function equipmentLabel(e: { equipment_type?: string | null; model?: string | null; serial_number?: string | null; description?: string | null } | null | undefined): string {
  if (!e) return ''
  const parts = [typeLabel(e.equipment_type), e.description || e.model, e.serial_number && `SN ${e.serial_number}`]
  return parts.filter(Boolean).join(' · ')
}
