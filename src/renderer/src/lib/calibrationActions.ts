import type { Transaction } from '@powersync/web'
import { db } from '@/powersync/db'
import { addDays, dateOnly, newCertificateNumber, nowISO, todayISO } from './format'
import { DEFAULT_TOLERANCE_PCT, isIncomplete, overallResult, parseConfig, sectionsFor, type CalConfig, type RowValues, type SectionDef } from './sheets'
import type { Calibration, CalibrationPoint, Customer, Equipment, ReferenceStandard, Visit } from '@/powersync/AppSchema'

type WithId<T> = T & { id: string }
type Tech = { userId: string; name: string }

// ---- Visits ---------------------------------------------------------------

/** Start a visit for a customer. The location defaults to the customer's
 *  specific location ("Test Lab" unless changed). */
export async function startVisit(customerId: string, tech: Tech, visitDate = todayISO()): Promise<string> {
  const id = crypto.randomUUID()
  const now = nowISO()
  await db.writeTransaction(async (tx) => {
    const c = await tx.get<WithId<Customer>>('SELECT * FROM customers WHERE id = ?', [customerId])
    await tx.execute(
      `INSERT INTO visits (id, org_id, customer_id, visit_date, location, technician_id, technician_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [id, c.org_id, c.id, visitDate, c.location || 'Test Lab', tech.userId, tech.name, now, now]
    )
  })
  return id
}

export async function setVisitStatus(id: string, status: 'open' | 'completed'): Promise<void> {
  await db.execute('UPDATE visits SET status = ?, updated_at = ? WHERE id = ?', [status, nowISO(), id])
}

// ---- Calibrations ------------------------------------------------------------

/** Start a calibration of one piece of equipment within a visit. All sheet rows
 *  are created up front; applied/target values are copied from that equipment's
 *  previous calibration (same sheet and line) so repeat work is quick. */
export async function startCalibration(visitId: string, equipmentId: string, config: CalConfig, tech: Tech): Promise<string> {
  const id = crypto.randomUUID()
  const now = nowISO()
  await db.writeTransaction(async (tx) => {
    const visit = await tx.get<WithId<Visit>>('SELECT * FROM visits WHERE id = ?', [visitId])
    const eq = await tx.get<WithId<Equipment>>('SELECT * FROM equipment WHERE id = ?', [equipmentId])
    // Template: the most recent COMPLETED calibration (a half-done draft is a poor
    // template); only if there is none, the most recent of any status.
    const last = await tx.getOptional<WithId<Calibration>>(
      `SELECT * FROM calibrations WHERE equipment_id = ?
       ORDER BY status = 'completed' DESC, substr(performed_at, 1, 10) DESC, created_at DESC LIMIT 1`,
      [equipmentId]
    )
    await tx.execute(
      `INSERT INTO calibrations (id, org_id, customer_id, equipment_id, visit_id, config, tolerance_pct, technician_id,
         technician_name, certificate_number, performed_at, procedure, standards_used, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [id, eq.org_id, visit.customer_id, eq.id, visit.id, JSON.stringify(config), last?.tolerance_pct ?? DEFAULT_TOLERANCE_PCT,
        tech.userId, tech.name, newCertificateNumber(), dateOnly(visit.visit_date) || todayISO(), last?.procedure ?? null,
        last?.standards_used ?? '[]', now, now]
    )
    const prior = last
      ? await tx.getAll<WithId<CalibrationPoint>>('SELECT section, seq, nominal FROM calibration_points WHERE calibration_id = ?', [last.id])
      : []
    const priorNominal = new Map(prior.map((p) => [`${p.section}#${p.seq}`, p.nominal]))
    for (const s of sectionsFor(eq.equipment_type, config, eq)) {
      for (let seq = 1; seq <= s.rows; seq++) {
        await tx.execute(
          `INSERT INTO calibration_points (id, org_id, calibration_id, section, seq, nominal, created_at, updated_at)
           VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
          [eq.org_id, id, s.key, seq, priorNominal.get(`${s.key}#${seq}`) ?? null, now, now]
        )
      }
    }
  })
  return id
}

/** Snapshot of a reference standard stored on a completed calibration. */
export interface StandardSnapshot {
  id: string
  name: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  certificate_number: string | null
  due_at: string | null
}

/** The equipment's last/next dates follow its most recent COMPLETED calibration. */
async function recomputeEquipmentDates(tx: Transaction, equipmentId: string): Promise<void> {
  const latest = await tx.getOptional<{ performed_at: string | null; due_at: string | null }>(
    `SELECT performed_at, due_at FROM calibrations WHERE equipment_id = ? AND status = 'completed'
     ORDER BY substr(performed_at, 1, 10) DESC, created_at DESC LIMIT 1`,
    [equipmentId]
  )
  if (!latest) return
  await tx.execute('UPDATE equipment SET last_calibrated_at = ?, next_due_at = ?, updated_at = ? WHERE id = ?', [
    dateOnly(latest.performed_at) || null,
    dateOnly(latest.due_at) || null,
    nowISO(),
    equipmentId
  ])
}

export function sectionsOf(cal: { config?: string | null }, eq: Parameters<typeof sectionsFor>[2] & { equipment_type?: string | null }): SectionDef[] {
  return sectionsFor(eq.equipment_type, parseConfig(cal.config), eq)
}

/** Lines with an applied value but a missing run (warned about before completing). */
export function countIncomplete(rows: readonly (RowValues & { section?: string | null })[], sections: readonly SectionDef[]): number {
  return sections.reduce((n, s) => n + rows.filter((r) => r.section === s.key && isIncomplete(r, s.kind)).length, 0)
}

/** Complete: result, due date, standards snapshot, equipment dates. Re-reads
 *  everything inside the write transaction so a reading saved on blur a moment
 *  before (clicking "Complete" while still in a cell) is included. */
export async function completeCalibration(calId: string): Promise<'pass' | 'fail' | null> {
  await new Promise((r) => setTimeout(r, 0)) // let a pending blur-save enqueue first
  let result: 'pass' | 'fail' | null = null
  await db.writeTransaction(async (tx) => {
    const cal = await tx.get<WithId<Calibration>>('SELECT * FROM calibrations WHERE id = ?', [calId])
    const eq = await tx.get<WithId<Equipment>>('SELECT * FROM equipment WHERE id = ?', [cal.equipment_id])
    const rows = await tx.getAll<WithId<CalibrationPoint>>('SELECT * FROM calibration_points WHERE calibration_id = ?', [calId])
    result = overallResult(rows, sectionsOf(cal, eq), Number(cal.tolerance_pct ?? DEFAULT_TOLERANCE_PCT))
    const performed = dateOnly(cal.performed_at) || todayISO()
    const interval = Number(eq.calibration_interval_days) || 0
    const due = cal.due_at ? dateOnly(cal.due_at) : interval ? addDays(performed, interval) : null

    let usedIds: string[] = []
    try { usedIds = JSON.parse(cal.standards_used || '[]') } catch { /* keep empty */ }
    const standards = usedIds.length
      ? await tx.getAll<WithId<ReferenceStandard>>(`SELECT * FROM reference_standards WHERE id IN (${usedIds.map(() => '?').join(',')})`, usedIds)
      : []
    const snapshot: StandardSnapshot[] = standards.map((s) => ({
      id: s.id, name: s.name ?? null, manufacturer: s.manufacturer ?? null, model: s.model ?? null,
      serial_number: s.serial_number ?? null, certificate_number: s.certificate_number ?? null, due_at: dateOnly(s.due_at) || null
    }))
    await tx.execute(
      `UPDATE calibrations SET status = 'completed', performed_at = ?, result = ?, due_at = ?, standards_snapshot = ?, updated_at = ? WHERE id = ?`,
      [performed, result, due, JSON.stringify(snapshot), nowISO(), cal.id]
    )
    await recomputeEquipmentDates(tx, eq.id)
  })
  return result
}

/** Back to draft. A due date that was only calculated from the interval is
 *  cleared so a corrected date recalculates it; a hand-entered one is kept. */
export async function reopenCalibration(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const cal = await tx.get<WithId<Calibration>>('SELECT * FROM calibrations WHERE id = ?', [id])
    const eq = await tx.getOptional<WithId<Equipment>>('SELECT * FROM equipment WHERE id = ?', [cal.equipment_id])
    const interval = Number(eq?.calibration_interval_days) || 0
    const performed = dateOnly(cal.performed_at)
    const wasAuto = !!performed && !!interval && dateOnly(cal.due_at) === addDays(performed, interval)
    await tx.execute(`UPDATE calibrations SET status = 'draft', due_at = ?, updated_at = ? WHERE id = ?`, [wasAuto ? null : cal.due_at, nowISO(), id])
  })
}

// ---- Deletes --------------------------------------------------------------
// The server cascades deletes; the local database doesn't. Delete children
// locally too (children first, so uploads apply cleanly) so lists and counts
// are right immediately, including offline.

async function deleteCalibrationTx(tx: Transaction, id: string): Promise<void> {
  await tx.execute('DELETE FROM calibration_points WHERE calibration_id = ?', [id])
  await tx.execute('DELETE FROM calibrations WHERE id = ?', [id])
}
async function deleteVisitTx(tx: Transaction, id: string): Promise<string[]> {
  const cals = await tx.getAll<{ id: string; equipment_id: string }>('SELECT id, equipment_id FROM calibrations WHERE visit_id = ?', [id])
  for (const c of cals) await deleteCalibrationTx(tx, c.id)
  await tx.execute('DELETE FROM visits WHERE id = ?', [id])
  return [...new Set(cals.map((c) => c.equipment_id))]
}
async function deleteEquipmentTx(tx: Transaction, id: string): Promise<void> {
  const cals = await tx.getAll<{ id: string }>('SELECT id FROM calibrations WHERE equipment_id = ?', [id])
  for (const c of cals) await deleteCalibrationTx(tx, c.id)
  await tx.execute('UPDATE equipment SET test_frame_id = NULL, updated_at = ? WHERE test_frame_id = ?', [nowISO(), id])
  await tx.execute('DELETE FROM equipment WHERE id = ?', [id])
}

export async function deleteCalibration(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const cal = await tx.getOptional<{ equipment_id: string }>('SELECT equipment_id FROM calibrations WHERE id = ?', [id])
    await deleteCalibrationTx(tx, id)
    if (cal) await recomputeEquipmentDates(tx, cal.equipment_id)
  })
}
export async function deleteVisit(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    for (const eqId of await deleteVisitTx(tx, id)) await recomputeEquipmentDates(tx, eqId)
  })
}
export async function deleteEquipment(id: string): Promise<void> {
  await db.writeTransaction((tx) => deleteEquipmentTx(tx, id))
}
export async function deleteCustomer(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const visits = await tx.getAll<{ id: string }>('SELECT id FROM visits WHERE customer_id = ?', [id])
    for (const v of visits) await deleteVisitTx(tx, v.id)
    const eqs = await tx.getAll<{ id: string }>('SELECT id FROM equipment WHERE customer_id = ?', [id])
    for (const e of eqs) await deleteEquipmentTx(tx, e.id)
    await tx.execute('DELETE FROM customers WHERE id = ?', [id])
  })
}
