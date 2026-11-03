import { db } from '@/powersync/db'
import { addDays, dateOnly, newCertificateNumber, nowISO, todayISO } from './format'
import { judge, overallAsFound, overallAsLeft, type PointLike } from './calibration'
import type { Calibration, CalibrationPoint, Equipment, ReferenceStandard } from '@/powersync/AppSchema'
import type { Transaction } from '@powersync/web'

type WithId<T> = T & { id: string }

/** Create a draft calibration. Test points (not readings) are copied from the
 *  equipment's most recent calibration so repeat work is fast. */
export async function startCalibration(
  equipment: WithId<Equipment>,
  tech: { userId: string; name: string }
): Promise<string> {
  const id = crypto.randomUUID()
  const now = nowISO()
  await db.writeTransaction(async (tx) => {
    const last = await tx.getOptional<WithId<Calibration>>(
      'SELECT * FROM calibrations WHERE equipment_id = ? ORDER BY performed_at DESC LIMIT 1',
      [equipment.id]
    )
    await tx.execute(
      `INSERT INTO calibrations (id, org_id, customer_id, equipment_id, technician_id, technician_name,
         certificate_number, performed_at, procedure, standards_used, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [id, equipment.org_id, equipment.customer_id, equipment.id, tech.userId, tech.name,
        newCertificateNumber(), todayISO(), last?.procedure ?? null, last?.standards_used ?? '[]', now, now]
    )
    if (last) {
      const pts = await tx.getAll<WithId<CalibrationPoint>>(
        'SELECT * FROM calibration_points WHERE calibration_id = ? ORDER BY seq',
        [last.id]
      )
      for (const p of pts) {
        await tx.execute(
          `INSERT INTO calibration_points (id, org_id, calibration_id, seq, parameter, units, nominal,
             tolerance_minus, tolerance_plus, created_at, updated_at)
           VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [equipment.org_id, id, p.seq, p.parameter, p.units, p.nominal, p.tolerance_minus, p.tolerance_plus, now, now]
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

/**
 * The equipment's last/next dates always follow its most recent COMPLETED
 * calibration, so correcting a date or deleting a calibration keeps them right.
 * With no completed calibrations the existing (possibly hand-entered) dates stay.
 */
async function recomputeEquipmentDates(tx: Transaction, equipmentId: string): Promise<void> {
  const latest = await tx.getOptional<{ performed_at: string | null; due_at: string | null }>(
    `SELECT performed_at, due_at FROM calibrations
     WHERE equipment_id = ? AND status = 'completed'
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

/** Mark complete: store results + a snapshot of the standards used, set the
 *  due date, and update the equipment record. Re-reads everything inside the
 *  write transaction so a reading saved on blur a moment before (e.g. clicking
 *  "Complete" while still in a field) is always included. */
export async function completeCalibration(calId: string): Promise<void> {
  // Let any pending blur-save enqueue its write first
  await new Promise((r) => setTimeout(r, 0))
  await db.writeTransaction(async (tx) => {
    const cal = await tx.get<WithId<Calibration>>('SELECT * FROM calibrations WHERE id = ?', [calId])
    const equipment = await tx.get<WithId<Equipment>>('SELECT * FROM equipment WHERE id = ?', [cal.equipment_id])
    const points = await tx.getAll<WithId<CalibrationPoint>>('SELECT * FROM calibration_points WHERE calibration_id = ?', [calId])
    const performed = dateOnly(cal.performed_at) || todayISO()
    const interval = Number(equipment.calibration_interval_days) || 0
    const due = cal.due_at ? dateOnly(cal.due_at) : interval ? addDays(performed, interval) : null
    const now = nowISO()

    let usedIds: string[] = []
    try { usedIds = JSON.parse(cal.standards_used || '[]') } catch { /* keep empty */ }
    const standards = usedIds.length
      ? await tx.getAll<WithId<ReferenceStandard>>(
          `SELECT * FROM reference_standards WHERE id IN (${usedIds.map(() => '?').join(',')})`,
          usedIds
        )
      : []
    const snapshot: StandardSnapshot[] = standards.map((s) => ({
      id: s.id,
      name: s.name ?? null,
      manufacturer: s.manufacturer ?? null,
      model: s.model ?? null,
      serial_number: s.serial_number ?? null,
      certificate_number: s.certificate_number ?? null,
      due_at: dateOnly(s.due_at) || null
    }))

    for (const p of points) {
      await tx.execute(
        'UPDATE calibration_points SET as_found_result = ?, as_left_result = ?, updated_at = ? WHERE id = ?',
        [judge(p.as_found, p as PointLike), judge(p.as_left ?? p.as_found, p as PointLike), now, p.id]
      )
    }
    await tx.execute(
      `UPDATE calibrations SET status = 'completed', performed_at = ?, as_found_result = ?, as_left_result = ?,
         due_at = ?, standards_snapshot = ?, updated_at = ? WHERE id = ?`,
      [performed, overallAsFound(points as PointLike[]), overallAsLeft(points as PointLike[]), due, JSON.stringify(snapshot), now, cal.id]
    )
    await recomputeEquipmentDates(tx, equipment.id)
  })
}

/** Points without an as-found reading (used to warn before completing). */
export function countMissingReadings(points: readonly { as_found: string | null }[]): number {
  return points.filter((p) => p.as_found === null || p.as_found === '').length
}

/** Back to draft for corrections. A due date that was only calculated from the
 *  interval is cleared, so changing the calibration date recalculates it;
 *  a due date entered by hand is kept. */
export async function reopenCalibration(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const cal = await tx.get<WithId<Calibration>>('SELECT * FROM calibrations WHERE id = ?', [id])
    const eq = await tx.getOptional<WithId<Equipment>>('SELECT * FROM equipment WHERE id = ?', [cal.equipment_id])
    const interval = Number(eq?.calibration_interval_days) || 0
    const performed = dateOnly(cal.performed_at)
    const wasAuto = !!performed && !!interval && dateOnly(cal.due_at) === addDays(performed, interval)
    await tx.execute(`UPDATE calibrations SET status = 'draft', due_at = ?, updated_at = ? WHERE id = ?`, [
      wasAuto ? null : cal.due_at,
      nowISO(),
      id
    ])
  })
}

// ---- Deletes --------------------------------------------------------------
// The server cascades deletes, but the local database doesn't. Delete children
// locally too (children first, so uploads apply cleanly) so counts and lists
// are right immediately — including while offline.

async function deleteCalibrationTx(tx: Transaction, id: string): Promise<void> {
  await tx.execute('DELETE FROM calibration_points WHERE calibration_id = ?', [id])
  await tx.execute('DELETE FROM calibrations WHERE id = ?', [id])
}

async function deleteEquipmentTx(tx: Transaction, id: string): Promise<void> {
  const cals = await tx.getAll<{ id: string }>('SELECT id FROM calibrations WHERE equipment_id = ?', [id])
  for (const c of cals) await deleteCalibrationTx(tx, c.id)
  await tx.execute('DELETE FROM equipment WHERE id = ?', [id])
}

export async function deleteCalibration(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const cal = await tx.getOptional<{ equipment_id: string }>('SELECT equipment_id FROM calibrations WHERE id = ?', [id])
    await deleteCalibrationTx(tx, id)
    if (cal) await recomputeEquipmentDates(tx, cal.equipment_id)
  })
}

export async function deleteEquipment(id: string): Promise<void> {
  await db.writeTransaction((tx) => deleteEquipmentTx(tx, id))
}

export async function deleteCustomer(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const eqs = await tx.getAll<{ id: string }>('SELECT id FROM equipment WHERE customer_id = ?', [id])
    for (const e of eqs) await deleteEquipmentTx(tx, e.id)
    await tx.execute('DELETE FROM customers WHERE id = ?', [id])
  })
}
