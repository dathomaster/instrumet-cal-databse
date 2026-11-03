import { useState } from 'react'
import { useQuery, useStatus } from '@powersync/react'
import { AlertTriangle, LogOut, X } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Field, Modal, PageHeader, Select, td, th } from '@/components/ui'
import { AutoInput } from '@/components/AutoInput'
import { SyncIndicator } from '@/components/SyncIndicator'
import { useAuth } from '@/lib/auth'
import { useMe, usePendingUploads } from '@/lib/hooks'
import { updateRow } from '@/lib/data'
import { db } from '@/powersync/db'
import type { OrgMember, UploadError } from '@/powersync/AppSchema'

export function Settings() {
  const { me } = useMe()
  const { user, signOut } = useAuth()
  const status = useStatus()
  const pending = usePendingUploads()
  const [confirmOut, setConfirmOut] = useState(false)
  const isAdmin = me?.role === 'admin'
  const { data: members } = useQuery<OrgMember & { id: string }>('SELECT * FROM org_members ORDER BY full_name COLLATE NOCASE')
  const { data: errors } = useQuery<UploadError & { id: string }>('SELECT * FROM upload_errors ORDER BY created_at DESC')

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your profile" />
          <div className="space-y-4 p-5">
            {me && <Field label="Name (appears on certificates)"><AutoInput table="org_members" rowId={me.id} field="full_name" value={me.full_name} boxed /></Field>}
            <Field label="Email"><div className="px-1 text-sm text-slate-700">{user?.email}</div></Field>
            <Field label="Role"><div className="px-1 text-sm capitalize text-slate-700">{me?.role}</div></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Company" subtitle={isAdmin ? undefined : 'Only admins can rename the company'} />
          <div className="space-y-4 p-5">
            {me && <Field label="Company name (appears on certificates)"><AutoInput table="organizations" rowId={me.org_id!} field="name" value={me.org_name} boxed disabled={!isAdmin} /></Field>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Sync" />
          <div className="space-y-3 p-5 text-sm">
            <SyncIndicator />
            <dl className="grid grid-cols-2 gap-y-2 text-slate-600">
              <dt>Server connection</dt><dd>{status.connected ? 'Connected' : status.connecting ? 'Connecting…' : 'Offline'}</dd>
              <dt>Last synced</dt><dd>{status.lastSyncedAt ? status.lastSyncedAt.toLocaleString() : 'Never'}</dd>
              <dt>Changes waiting to upload</dt><dd data-testid="pending-count">{pending}</dd>
            </dl>
            <p className="text-xs text-slate-500">Everything you enter is saved on this computer first. Changes upload automatically whenever you are online, and edits by other technicians appear here within seconds.</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sign out" />
          <div className="space-y-3 p-5 text-sm text-slate-600">
            <p>Signing out removes the local copy of your company’s data from this computer.</p>
            <Button variant="danger" onClick={() => setConfirmOut(true)}><LogOut size={15} />Sign out</Button>
          </div>
        </Card>

        {errors.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader title={<span className="flex items-center gap-2 text-red-700"><AlertTriangle size={16} />Changes the server rejected</span>} subtitle="These edits could not be saved (e.g. another technician deleted the record). Re-enter them if still needed." actions={<Button size="sm" variant="ghost" onClick={() => db.execute('DELETE FROM upload_errors')}>Clear all</Button>} />
            <table className="w-full">
              <thead className="bg-slate-50/60"><tr><th className={th}>When</th><th className={th}>Record</th><th className={th}>Reason</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {errors.map((e) => (
                  <tr key={e.id}>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{new Date(e.created_at!).toLocaleString()}</td>
                    <td className={td}><Badge>{e.op}</Badge> <span className="text-slate-700">{e.table_name?.replace(/_/g, ' ')}</span><div className="max-w-md truncate font-mono text-xs text-slate-400" title={e.data ?? ''}>{e.data}</div></td>
                    <td className={`${td} text-red-700`}>{e.message}</td>
                    <td className={td}><button className="text-slate-400 hover:text-slate-700" onClick={() => db.execute('DELETE FROM upload_errors WHERE id = ?', [e.id])} aria-label="Dismiss"><X size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader title="Team" subtitle={isAdmin ? 'New technicians join automatically when they create an account' : undefined} />
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Role</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className={`${td} font-medium text-slate-800`}>{m.full_name || '—'}{m.user_id === user?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}</td>
                  <td className={`${td} text-slate-600`}>{m.email}</td>
                  <td className={td}>
                    {isAdmin && m.user_id !== user?.id ? (
                      <Select value={m.role ?? 'technician'} onChange={(e) => updateRow('org_members', m.id, { role: e.target.value }, { role: m.role })} className="w-36 py-1">
                        <option value="technician">Technician</option>
                        <option value="admin">Admin</option>
                      </Select>
                    ) : <span className="text-sm capitalize text-slate-600">{m.role}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal open={confirmOut} onClose={() => setConfirmOut(false)} title="Sign out?" footer={<><Button variant="secondary" onClick={() => setConfirmOut(false)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" onClick={signOut}>Sign out</Button></>}>
        {pending > 0 ? (
          <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{pending} change{pending === 1 ? ' has' : 's have'} not uploaded yet and will be lost. Connect to the internet and wait for sync to finish first.</p>
        ) : <p className="text-sm text-slate-600">All your changes are synced. The local copy will be removed from this computer.</p>}
      </Modal>
    </>
  )
}
