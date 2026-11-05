import { db } from '@/powersync/db'
import { buildCalibrationCsv, csvFileName, type CsvInput } from './csv'
import { sectionsOf, type StandardSnapshot } from './calibrationActions'
import { desktop } from './desktop'
import type { Calibration, CalibrationPoint, Customer, Equipment, ReferenceStandard, Visit } from '@/powersync/AppSchema'

type WithId<T> = T & { id: string }

/** Everything the CSV / certificate needs, read from the local database (works offline). */
export async function loadCalibrationExport(calId: string): Promise<CsvInput> {
  const cal = await db.get<WithId<Calibration>>('SELECT * FROM calibrations WHERE id = ?', [calId])
  const [equipment, customer, visit, rows, org] = await Promise.all([
    db.get<WithId<Equipment>>('SELECT * FROM equipment WHERE id = ?', [cal.equipment_id]),
    db.get<WithId<Customer>>('SELECT * FROM customers WHERE id = ?', [cal.customer_id]),
    db.get<WithId<Visit>>('SELECT * FROM visits WHERE id = ?', [cal.visit_id]),
    db.getAll<WithId<CalibrationPoint>>('SELECT * FROM calibration_points WHERE calibration_id = ? ORDER BY section, seq', [calId]),
    db.getOptional<{ name: string }>('SELECT name FROM organizations WHERE id = ?', [cal.org_id])
  ])
  const testFrame = equipment.test_frame_id
    ? await db.getOptional<WithId<Equipment>>('SELECT * FROM equipment WHERE id = ?', [equipment.test_frame_id])
    : null
  let standards: CsvInput['standards'] = []
  if (cal.status === 'completed' && cal.standards_snapshot) {
    try { standards = JSON.parse(cal.standards_snapshot) as StandardSnapshot[] } catch { /* fall through */ }
  } else {
    let ids: string[] = []
    try { ids = JSON.parse(cal.standards_used || '[]') } catch { /* none */ }
    if (ids.length) standards = await db.getAll<WithId<ReferenceStandard>>(`SELECT * FROM reference_standards WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  }
  return { org, customer, visit, calibration: cal, equipment, testFrame, standards, sections: sectionsOf(cal, equipment), rows }
}

/** Build the calibration CSV and let the technician save it. */
export async function exportCalibrationCsv(calId: string): Promise<{ ok: boolean; filePath?: string }> {
  const data = await loadCalibrationExport(calId)
  const csv = buildCalibrationCsv(data)
  const name = csvFileName(data)
  const d = desktop()
  if (d?.saveTextFile) return d.saveTextFile(name, csv)
  // Browser fallback
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { ok: true }
}
