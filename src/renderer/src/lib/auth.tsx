import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { connectOnce, db, disconnectAndClear } from '@/powersync/db'

export interface AppUser {
  id: string
  email: string
}

interface AuthState {
  user: AppUser | null
  ready: boolean
  /** The server session is gone (e.g. revoked); local data is kept until they sign in again. */
  needsSignIn: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const LAST_USER = 'cal.lastUser'
const DB_OWNER = 'cal.dbOwner'

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

/**
 * Opens the local database for a user. Only an actual identity change wipes
 * local data; re-confirming the same user is a no-op so content never flickers.
 */
async function activate(user: AppUser): Promise<void> {
  const owner = read<string>(DB_OWNER)
  if (owner && owner !== user.id) await disconnectAndClear()
  write(DB_OWNER, user.id)
  write(LAST_USER, user)
  connectOnce()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Offline-first boot: trust the last signed-in user immediately so the
  // technician can work with local data before (or without) the network.
  const [user, setUser] = useState<AppUser | null>(() => read<AppUser>(LAST_USER))
  const [ready, setReady] = useState(false)
  const [needsSignIn, setNeedsSignIn] = useState(false)

  useEffect(() => {
    const last = read<AppUser>(LAST_USER)
    if (last) activate(last)

    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s?.user) {
        const u = { id: s.user.id, email: s.user.email ?? '' }
        setUser(u)
        activate(u)
      }
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const u = { id: session.user.id, email: session.user.email ?? '' }
        setUser(u)
        setNeedsSignIn(false)
        activate(u)
      } else if (event === 'SIGNED_OUT' && read<AppUser>(LAST_USER)) {
        // Session revoked/expired server-side: keep local data + pending changes,
        // ask the technician to sign in again so syncing can resume.
        setNeedsSignIn(true)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    if (error) return error.message
    if (!data.session) return 'CHECK_EMAIL'
    return null
  }, [])

  const signOut = useCallback(async () => {
    write(LAST_USER, null)
    write(DB_OWNER, null)
    await disconnectAndClear()
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    setUser(null)
    setNeedsSignIn(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, ready, needsSignIn, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

export { db }
