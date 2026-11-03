import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { connectOnce, db, disconnect, disconnectAndClear } from '@/powersync/db'
import { checkLocalLogin, forgetLocalLogin, rememberLocalLogin } from './localLogin'

export interface AppUser {
  id: string
  email: string
}

interface AuthState {
  /** Who is using the app right now (null = sign-in screen). */
  user: AppUser | null
  /** Whose data is stored on this computer (survives sign-out). */
  deviceUser: AppUser | null
  /** Working locally, but the server needs a password before syncing can resume. */
  needsSignIn: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>
  signOut: (opts?: { erase?: boolean }) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const DEVICE_USER = 'cal.dbOwner' // whose data is in the local database
const ACTIVE = 'cal.active' // currently signed in on this computer

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

// Migrate the earlier storage format (owner id + lastUser) once.
;(() => {
  const owner = read<unknown>(DEVICE_USER)
  const last = read<AppUser>('cal.lastUser')
  if (typeof owner === 'string') write(DEVICE_USER, last && last.id === owner ? last : null)
  if (last) write(ACTIVE, true)
  write('cal.lastUser', null)
})()

const isNetworkError = (e: unknown) =>
  !navigator.onLine || isAuthRetryableFetchError(e) || (e instanceof Error && /fetch|network/i.test(e.message))

/** Open the local database for this person. Only a DIFFERENT person wipes it. */
async function activate(user: AppUser): Promise<void> {
  const owner = read<AppUser>(DEVICE_USER)
  if (owner && owner.id !== user.id) await disconnectAndClear()
  write(DEVICE_USER, user)
  write(ACTIVE, true)
  connectOnce()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Offline-first boot: if someone was signed in, open their data immediately.
  const [user, setUser] = useState<AppUser | null>(() => (read<boolean>(ACTIVE) ? read<AppUser>(DEVICE_USER) : null))
  const [deviceUser, setDeviceUser] = useState<AppUser | null>(() => read<AppUser>(DEVICE_USER))
  const [needsSignIn, setNeedsSignIn] = useState(false)
  // Password typed during an offline sign-in, kept in memory only, so syncing
  // can resume by itself as soon as the internet is back.
  const pendingPassword = useRef<string | null>(null)

  const onSession = useCallback((u: { id: string; email?: string }) => {
    const appUser = { id: u.id, email: u.email ?? '' }
    pendingPassword.current = null
    setNeedsSignIn(false)
    setUser(appUser)
    setDeviceUser(appUser)
    return activate(appUser)
  }, [])

  useEffect(() => {
    const active = read<boolean>(ACTIVE)
    const owner = read<AppUser>(DEVICE_USER)
    if (active && owner) connectOnce()

    supabase.auth.getSession().then(({ data, error }) => {
      if (data.session?.user) onSession(data.session.user)
      else if (active && owner && !error) setNeedsSignIn(true) // no server session at all (not just offline)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) onSession(session.user)
      // The server ended the session (revoked / password changed). Keep working
      // locally; just ask for the password when convenient so sync can resume.
      else if (event === 'SIGNED_OUT' && read<boolean>(ACTIVE)) setNeedsSignIn(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [onSession])

  // After an offline sign-in, finish signing in with the server once online.
  useEffect(() => {
    const tryResume = async () => {
      const owner = read<AppUser>(DEVICE_USER)
      if (!pendingPassword.current || !owner) return
      const { error } = await supabase.auth.signInWithPassword({ email: owner.email, password: pendingPassword.current })
      if (error && !isNetworkError(error)) {
        pendingPassword.current = null
        setNeedsSignIn(true) // e.g. password was changed on another computer
      }
    }
    window.addEventListener('online', tryResume)
    const t = setInterval(tryResume, 10_000)
    return () => {
      window.removeEventListener('online', tryResume)
      clearInterval(t)
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    email = email.trim()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) {
      await rememberLocalLogin(email, password)
      return null
    }
    if (!isNetworkError(error)) return (error as AuthError).message

    // Offline: unlock this computer's data if it belongs to this person.
    const owner = read<AppUser>(DEVICE_USER)
    if (!owner || owner.email.toLowerCase() !== email.toLowerCase()) {
      return owner
        ? `You're offline. Without internet only ${owner.email} can sign in on this computer.`
        : "You're offline. Connect to the internet to sign in for the first time."
    }
    if (!(await checkLocalLogin(email, password))) return 'Incorrect password.'
    pendingPassword.current = password
    write(ACTIVE, true)
    setUser(owner)
    connectOnce()
    return null
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName } }
    })
    if (error) return isNetworkError(error) ? "You're offline. Connect to the internet to create an account." : error.message
    if (!data.session) return 'CHECK_EMAIL'
    await rememberLocalLogin(email.trim(), password)
    return null
  }, [])

  const signOut = useCallback(async ({ erase = false }: { erase?: boolean } = {}) => {
    write(ACTIVE, false)
    pendingPassword.current = null
    if (erase) {
      await disconnectAndClear()
      write(DEVICE_USER, null)
      forgetLocalLogin()
      setDeviceUser(null)
    } else {
      await disconnect() // data + unsynced changes stay on this computer
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    setUser(null)
    setNeedsSignIn(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, deviceUser, needsSignIn, signIn, signUp, signOut }}>
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
