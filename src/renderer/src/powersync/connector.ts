import { UpdateType } from '@powersync/web'
import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  PowerSyncCredentials
} from '@powersync/web'
import { supabase } from '@/lib/supabase'
import { config } from '@/lib/config'
import { clean, isPermanent, type OpError } from './uploadRules'

async function applyOp(op: CrudEntry): Promise<OpError | null> {
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
  return res?.error ? { code: res.error.code, message: res.error.message, status: res.status } : null
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
    // Without a signed-in session every write would be refused as "anonymous"
    // and wrongly treated as rejected. Wait (PowerSync retries) instead.
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw new Error('Waiting for sign-in before uploading')

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
