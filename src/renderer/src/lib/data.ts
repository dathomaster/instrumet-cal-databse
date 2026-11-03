import { db } from '@/powersync/db'
import { nowISO } from './format'

type Row = Record<string, string | number | null | undefined>

const norm = (v: unknown) => (v === '' || v === undefined ? null : v)

/** Insert a row locally (synced in the background). Returns the new id. */
export async function insertRow(table: string, values: Row): Promise<string> {
  const id = crypto.randomUUID()
  const now = nowISO()
  const row: Row = { ...values, id, created_at: now, updated_at: now }
  const cols = Object.keys(row)
  await db.execute(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => norm(row[c]))
  )
  return id
}

/**
 * Update only the columns that actually changed. PowerSync uploads a PATCH
 * with just those columns, so two technicians editing different fields of
 * the same record don't overwrite each other.
 */
export async function updateRow(table: string, id: string, next: Row, prev?: Row): Promise<void> {
  const changed = Object.keys(next).filter((k) => !prev || norm(prev[k]) !== norm(next[k]))
  if (!changed.length) return
  await db.execute(
    `UPDATE ${table} SET ${changed.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...changed.map((c) => norm(next[c])), nowISO(), id]
  )
}

export async function deleteRow(table: string, id: string): Promise<void> {
  await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
}

/** Pick only the listed keys from a row (for form state). */
export function pick<T extends object>(row: T | null | undefined, keys: string[]): Row {
  const out: Row = {}
  for (const k of keys) out[k] = ((row as Record<string, unknown>)?.[k] as string | number | null) ?? ''
  return out
}
