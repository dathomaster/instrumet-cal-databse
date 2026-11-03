import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Gauge, Loader2, WifiOff } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useOnline } from '@/lib/hooks'
import { db } from '@/powersync/db'
import { Button, Field, Input } from '@/components/ui'

export function Login() {
  const { signIn, signUp, deviceUser } = useAuth()
  const online = useOnline()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(deviceUser?.email ?? '')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [unsynced, setUnsynced] = useState(0)

  useEffect(() => {
    if (deviceUser) db.getUploadQueueStats().then((s) => setUnsynced(s.count)).catch(() => undefined)
  }, [deviceUser])

  const differentPerson = !!deviceUser && email.trim() !== '' && email.trim().toLowerCase() !== deviceUser.email.toLowerCase()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const err = mode === 'in' ? await signIn(email, password) : await signUp(email, password, fullName.trim())
    setBusy(false)
    if (err === 'CHECK_EMAIL') setMsg({ tone: 'info', text: 'Account created. Check your email to confirm it, then sign in here.' })
    else if (err) setMsg({ tone: 'error', text: err })
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-brand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 rounded-xl bg-brand-600 p-2.5 text-white shadow-sm">
            <Gauge size={26} />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Instrumet Calibration</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'up' ? 'Create your technician account.' : deviceUser ? 'Welcome back. Your data is saved on this computer.' : 'Sign in to sync your calibration records.'}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {!online && (
            <p className="flex items-start gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
              <WifiOff size={14} className="mt-0.5 shrink-0" />
              {deviceUser && mode === 'in'
                ? `You're offline — you can still sign in as ${deviceUser.email} and keep working. Changes sync when you're back online.`
                : "You're offline. Connect to the internet to sign in for the first time."}
            </p>
          )}
          {mode === 'up' && (
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus={!email} />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'up' ? 8 : undefined}
              autoFocus={!!email}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />
          </Field>
          {differentPerson && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                This computer holds {deviceUser!.email}’s data. Signing in as someone else replaces it with yours.
                {unsynced > 0 && <strong> {unsynced} unsynced change{unsynced === 1 ? '' : 's'} would be lost — sign in as {deviceUser!.email} while online first.</strong>}
              </span>
            </p>
          )}
          {msg && (
            <p className={msg.tone === 'error' ? 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700' : 'rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700'}>{msg.text}</p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === 'in' ? 'New technician?' : 'Already have an account?'}{' '}
          <button className="font-medium text-brand-700 hover:underline" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
            {mode === 'in' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
