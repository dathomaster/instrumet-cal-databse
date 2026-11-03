import { useState } from 'react'
import { KeyRound, UserMinus, Copy, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { deleteRow } from '@/lib/data'
import { Button, Field, Input, Modal } from './ui'

function tempPassword(): string {
  // Easy to read out over the phone: no 0/O or 1/l/I
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const r = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(r, (n) => chars[n % chars.length]).join('').replace(/(.{5})/, '$1-')
}

type Member = { id: string; full_name: string | null; email: string | null }

export function ResetPasswordButton({ member }: { member: Member }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const name = member.full_name || member.email

  async function save() {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('admin_set_member_password', { p_member_id: member.id, p_password: pw })
    setBusy(false)
    if (error) setErr(navigator.onLine && !/fetch/i.test(error.message) ? error.message : 'You need to be online to reset a password.')
    else setDone(true)
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setPw(tempPassword()); setDone(false); setErr(null); setOpen(true) }}>
        <KeyRound size={13} />Reset password
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Reset password for ${name}`}
        footer={done ? <Button onClick={() => setOpen(false)}>Done</Button> : <><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={busy || pw.length < 8}>Set password</Button></>}
      >
        {done ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p className="flex items-center gap-2 font-medium text-emerald-700"><Check size={16} />Password changed.</p>
            <p>Give {name} this temporary password. They can change it under Settings → Your profile.</p>
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-center font-mono text-lg tracking-wider text-slate-900">{pw}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Temporary password" hint="At least 8 characters. You'll tell them this password.">
              <div className="flex gap-2">
                <Input value={pw} onChange={(e) => setPw(e.target.value)} className="font-mono" />
                <Button variant="secondary" type="button" onClick={() => navigator.clipboard.writeText(pw)} title="Copy"><Copy size={14} /></Button>
              </div>
            </Field>
            {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}

export function RemoveMemberButton({ member }: { member: Member }) {
  const [open, setOpen] = useState(false)
  const name = member.full_name || member.email
  return (
    <>
      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setOpen(true)}><UserMinus size={13} />Remove</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove ${name}?`}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" onClick={async () => { await deleteRow('org_members', member.id); setOpen(false) }}>Remove</Button></>}
      >
        <p className="text-sm text-slate-600">
          {name} immediately loses access to all company data. Their copy on their laptop is removed the next time it connects.
          Calibrations they already did are kept.
        </p>
      </Modal>
    </>
  )
}
