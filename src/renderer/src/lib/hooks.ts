import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQuery, useStatus } from '@powersync/react'
import { db } from '@/powersync/db'
import { useAuth } from './auth'
import type { OrgMember } from '@/powersync/AppSchema'

export interface Me extends OrgMember {
  id: string
  org_name: string | null
}

/** The signed-in technician's membership row + company name (synced). */
export function useMe(): { me: Me | null; isLoading: boolean } {
  const { user } = useAuth()
  const { data, isLoading } = useQuery<Me>(
    `SELECT m.*, o.name AS org_name FROM org_members m
     LEFT JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = ? LIMIT 1`,
    [user?.id ?? '']
  )
  return { me: data[0] ?? null, isLoading }
}

// One shared poller for the upload-queue size so every badge shows the same number.
let pendingCount = 0
const pendingListeners = new Set<() => void>()
let pendingTimer: ReturnType<typeof setInterval> | null = null
async function refreshPending(): Promise<void> {
  try {
    const n = (await db.getUploadQueueStats()).count
    if (n !== pendingCount) {
      pendingCount = n
      pendingListeners.forEach((l) => l())
    }
  } catch {
    /* db closing */
  }
}
function subscribePending(cb: () => void): () => void {
  pendingListeners.add(cb)
  if (!pendingTimer) {
    refreshPending()
    pendingTimer = setInterval(refreshPending, 1000)
  }
  return () => {
    pendingListeners.delete(cb)
    if (!pendingListeners.size && pendingTimer) {
      clearInterval(pendingTimer)
      pendingTimer = null
    }
  }
}

/** Number of local changes not yet uploaded to the server. */
export function usePendingUploads(): number {
  const status = useStatus()
  useEffect(() => {
    refreshPending()
  }, [status.dataFlowStatus.uploading])
  return useSyncExternalStore(subscribePending, () => pendingCount)
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
