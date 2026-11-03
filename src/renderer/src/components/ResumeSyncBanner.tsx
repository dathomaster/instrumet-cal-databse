import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button, Field, Modal, PasswordInput } from './ui'

/** Non-blocking: work continues locally; syncing resumes after the password. */
export function ResumeSyncBanner() {
  const { needsSignIn, deviceUser, signIn } = useAuth()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!needsSignIn) return null

  async function submit() {
    setBusy(true)
    setErr(null)
    const e = await signIn(deviceUser?.email ?? '', password)
    setBusy(false)
    if (e) setErr(e)
    else { setOpen(false); setPassword('') }
  }

  return (
    <>
      <div className="no-print flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-8 py-2.5 text-sm text-amber-900">
        <KeyRound size={16} className="shrink-0" />
        <span className="flex-1">You can keep working — your changes are saved on this computer. Enter your password to resume syncing with your team.</span>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Resume syncing</Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Resume syncing"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Later</Button><Button onClick={submit} disabled={busy || !password}>Sign in</Button></>}
      >
        <form onSubmit={(e) => { e.preventDefault(); submit() }} className="space-y-3">
          <p className="text-sm text-slate-600">The server asked {deviceUser?.email} to sign in again (for example after a password change).</p>
          <Field label="Password"><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        </form>
      </Modal>
    </>
  )
}
