import { db } from '@/powersync/db'
import { addDays, dateOnly, newCertificateNumber, nowISO, todayISO } from './format'
import { judge, overallAsFound, overallAsLeft, type PointLike } from './calibration'
import type { Calibration, CalibrationPoint, Equipment } from '@/powersync/AppSchema'

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

/** Mark complete: store results, set due date, update the equipment record.
 *  Re-reads everything inside the write transaction so a reading saved on
 *  blur a moment before (e.g. clicking "Complete" while still in a field)
 *  is always included. */
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
    for (const p of points) {
      await tx.execute(
        'UPDATE calibration_points SET as_found_result = ?, as_left_result = ?, updated_at = ? WHERE id = ?',
        [judge(p.as_found, p as PointLike), judge(p.as_left ?? p.as_found, p as PointLike), now, p.id]
      )
    }
    await tx.execute(
      `UPDATE calibrations SET status = 'completed', performed_at = ?, as_found_result = ?, as_left_result = ?, due_at = ?, updated_at = ? WHERE id = ?`,
      [performed, overallAsFound(points as PointLike[]), overallAsLeft(points as PointLike[]), due, now, cal.id]
    )
    // Only move the equipment's dates forward (completing an old record late shouldn't regress them)
    if (!equipment.last_calibrated_at || dateOnly(equipment.last_calibrated_at) <= performed) {
      await tx.execute(
        'UPDATE equipment SET last_calibrated_at = ?, next_due_at = ?, updated_at = ? WHERE id = ?',
        [performed, due, now, equipment.id]
      )
    }
  })
}

export async function reopenCalibration(id: string): Promise<void> {
  await db.execute(`UPDATE calibrations SET status = 'draft', updated_at = ? WHERE id = ?`, [nowISO(), id])
}
