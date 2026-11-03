import { useEffect, useState } from 'react'
import { usePowerSync, useQuery, useStatus } from '@powersync/react'
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

/** Number of local changes not yet uploaded to the server. */
export function usePendingUploads(): number {
  const db = usePowerSync()
  const status = useStatus()
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const tick = () => db.getUploadQueueStats().then((s) => alive && setCount(s.count)).catch(() => undefined)
    tick()
    const t = setInterval(tick, 1500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [db, status.dataFlowStatus.uploading])
  return count
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
