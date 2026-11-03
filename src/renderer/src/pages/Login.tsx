import { useState, type FormEvent } from 'react'
import { Gauge, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button, Field, Input } from '@/components/ui'

export function Login({ reauth }: { reauth?: boolean }) {
  const { signIn, signUp, user } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(reauth ? (user?.email ?? '') : '')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const err = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password, fullName.trim())
    setBusy(false)
    if (err === 'CHECK_EMAIL') setMsg({ tone: 'info', text: 'Account created. Check your email to confirm it, then sign in.' })
    else if (err) setMsg({ tone: 'error', text: navigator.onLine ? err : 'You are offline. Connect to the internet to sign in the first time.' })
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
            {reauth ? 'Your session expired. Sign in again to resume syncing — your local work is safe.' : 'Sign in to sync your calibration records.'}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {mode === 'up' && (
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'up' ? 8 : undefined}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />
          </Field>
          {msg && (
            <p className={msg.tone === 'error' ? 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700' : 'rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700'}>
              {msg.text}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        {!reauth && (
          <p className="mt-4 text-center text-sm text-slate-500">
            {mode === 'in' ? 'New technician?' : 'Already have an account?'}{' '}
            <button className="font-medium text-brand-700 hover:underline" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
              {mode === 'in' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
