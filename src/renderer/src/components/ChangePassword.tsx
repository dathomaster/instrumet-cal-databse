import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { rememberLocalLogin } from '@/lib/localLogin'
import { useAuth } from '@/lib/auth'
import { Button, Field, Modal, PasswordInput } from './ui'

export function ChangePasswordButton() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    if (pw.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters.' })
    if (pw !== pw2) return setMsg({ ok: false, text: "Passwords don't match." })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: /fetch|network/i.test(error.message) || !navigator.onLine ? 'You need to be online to change your password.' : error.message })
    await rememberLocalLogin(user!.email, pw) // offline sign-in uses the new password too
    setMsg({ ok: true, text: 'Password changed.' })
    setPw('')
    setPw2('')
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setMsg(null); setOpen(true) }}>Change password</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Change password"
        footer={msg?.ok ? <Button onClick={() => setOpen(false)}>Done</Button> : <><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={busy}>Save</Button></>}
      >
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
          {!msg?.ok && (
            <>
              <Field label="New password"><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus /></Field>
              <Field label="Repeat new password"><PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
            </>
          )}
          {msg && <p className={msg.ok ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700' : 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'}>{msg.text}</p>}
          <button type="submit" hidden />
        </form>
      </Modal>
    </>
  )
}
