import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@powersync/react'
import { Plus, Users } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput, td, th } from '@/components/ui'
import { CustomerForm } from '@/components/forms'
import { addDays, DUE_SOON_DAYS, joinNonEmpty, todayISO } from '@/lib/format'

interface Row { id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; city: string | null; state: string | null; equipment_count: number; due_count: number; overdue_count: number }

export function Customers() {
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const nav = useNavigate()
  const like = `%${q.trim()}%`
  const today = todayISO()
  const { data, isLoading } = useQuery<Row>(
    `SELECT c.id, c.name, c.contact_name, c.phone, c.email, c.city, c.state,
       (SELECT count(*) FROM equipment e WHERE e.customer_id = c.id AND e.status = 'active') AS equipment_count,
       (SELECT count(*) FROM equipment e WHERE e.customer_id = c.id AND e.status = 'active' AND substr(e.next_due_at,1,10) BETWEEN ? AND ?) AS due_count,
       (SELECT count(*) FROM equipment e WHERE e.customer_id = c.id AND e.status = 'active' AND substr(e.next_due_at,1,10) < ?) AS overdue_count
     FROM customers c
     WHERE c.name LIKE ? OR c.contact_name LIKE ? OR c.city LIKE ? OR c.email LIKE ?
     ORDER BY c.name COLLATE NOCASE`,
    [today, addDays(today, DUE_SOON_DAYS), today, like, like, like, like]
  )

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${data.length} customer${data.length === 1 ? '' : 's'}`}
        actions={<Button onClick={() => setAdding(true)}><Plus size={16} />New customer</Button>}
      />
      <Card>
        <div className="border-b border-slate-100 px-4 py-3"><SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" /></div>
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title={q ? 'No matches' : 'No customers yet'} action={!q && <Button onClick={() => setAdding(true)}><Plus size={16} />Add your first customer</Button>}>
            {q ? 'Try a different search.' : 'Customers you add are saved on this computer and sync to your team automatically.'}
          </EmptyState>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50/60"><tr><th className={th}>Name</th><th className={th}>Contact</th><th className={th}>Location</th><th className={th}>Equipment</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/customers/${c.id}`)}>
                  <td className={td}><Link to={`/customers/${c.id}`} className="font-medium text-slate-800">{c.name}</Link></td>
                  <td className={`${td} text-slate-600`}>{c.contact_name || '—'}<div className="text-xs text-slate-400">{joinNonEmpty([c.phone, c.email], ' · ')}</div></td>
                  <td className={`${td} text-slate-600`}>{joinNonEmpty([c.city, c.state]) || '—'}</td>
                  <td className={`${td} text-slate-600`}>{c.equipment_count}</td>
                  <td className={`${td} space-x-1 text-right`}>
                    {c.overdue_count > 0 && <Badge tone="red">{c.overdue_count} overdue</Badge>}
                    {c.due_count > 0 && <Badge tone="amber">{c.due_count} due soon</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <CustomerForm open={adding} onClose={() => setAdding(false)} onCreated={(id) => nav(`/customers/${id}`)} />
    </>
  )
}
