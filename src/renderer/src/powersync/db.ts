import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web'
import { AppSchema } from './AppSchema'
import { SupabaseConnector } from './connector'

// One database for the lifetime of the window (created at module scope so
// React Strict Mode double-mounting can't close it).
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'calibration.db',
    vfs: WASQLiteVFS.OPFSCoopSyncVFS,
    // Single desktop window: no SharedWorker needed
    enableMultiTabs: false
  }
})

export const connector = new SupabaseConnector()

let connected = false
/** connect() must only be called once per session. */
export function connectOnce(): void {
  if (connected) return
  connected = true
  db.connect(connector)
}

/** Stop syncing but keep all local data (and unsynced changes) on this computer. */
export async function disconnect(): Promise<void> {
  connected = false
  await db.disconnect()
}

/** Stop syncing and erase all local data. */
export async function disconnectAndClear(): Promise<void> {
  connected = false
  await db.disconnectAndClear()
}
