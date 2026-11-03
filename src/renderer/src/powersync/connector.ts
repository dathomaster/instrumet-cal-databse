import { UpdateType } from '@powersync/web'
import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  PowerSyncCredentials
} from '@powersync/web'
import { supabase } from '@/lib/supabase'
import { config } from '@/lib/config'

/**
 * Postgres error classes that will never succeed on retry:
 *  22xxx data exception, 23xxx integrity violation, 42501 RLS / permission,
 *  PGRST1xx/2xx request errors. Retrying them would block the upload queue
 *  forever, so they are recorded locally and skipped.
 */
function isPermanent(error: { code?: string } | null | undefined): boolean {
  const code = error?.code ?? ''
  return /^(22|23)/.test(code) || code === '42501' || /^PGRST[12]/.test(code)
}

/** SQLite/forms give '' for empty fields; Postgres numeric/date columns need null. */
function clean(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data ?? {})) out[k] = v === '' ? null : v
  return out
}

async function applyOp(op: CrudEntry): Promise<{ code?: string; message: string } | null> {
  const table = supabase.from(op.table)
  let res
  switch (op.op) {
    case UpdateType.PUT:
      res = await table.upsert({ ...clean(op.opData), id: op.id })
      break
    case UpdateType.PATCH:
      res = await table.update(clean(op.opData)).eq('id', op.id)
      break
    case UpdateType.DELETE:
      res = await table.delete().eq('id', op.id)
      break
  }
  return res?.error ?? null
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    // Always fetch a fresh session; supabase-js refreshes the token if needed.
    // Throwing here (e.g. offline) makes PowerSync retry later with backoff.
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) throw error ?? new Error('Not signed in')
    return {
      endpoint: config.powersyncUrl,
      token: data.session.access_token,
      expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000) : undefined
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) return

    for (const op of transaction.crud) {
      const error = await applyOp(op)
      if (!error) continue
      if (isPermanent(error)) {
        console.error('Upload rejected by server, skipping', op, error)
        await database.execute(
          `INSERT INTO upload_errors (id, table_name, row_id, op, message, data, created_at)
           VALUES (uuid(), ?, ?, ?, ?, ?, ?)`,
          [op.table, op.id, op.op, `${error.code ?? ''} ${error.message}`.trim(), JSON.stringify(op.opData ?? null), new Date().toISOString()]
        )
        continue
      }
      // Network / server hiccup: throw so PowerSync retries the whole transaction.
      throw new Error(error.message)
    }
    await transaction.complete() // REQUIRED, otherwise the queue stalls
  }
}
