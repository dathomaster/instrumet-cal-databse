import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useRows } from '@/lib/useRows'
import { AlertTriangle, CalendarClock, ClipboardCheck, Users, Wrench } from 'lucide-react'
import { Card, CardHeader, EmptyState, PageHeader, td, th } from '@/components/ui'
import { DueBadge, ResultBadge } from '@/components/DueBadge'
import { addDays, DUE_SOON_DAYS, fmtDate, todayISO } from '@/lib/format'
import { useMe } from '@/lib/hooks'

interface DueRowData { id: string; description: string; serial_number: string | null; next_due_at: string | null; customer_name: string; customer_id: string }
interface RecentRow { id: string; certificate_number: string | null; performed_at: string; status: string; as_left_result: string | null; description: string; customer_name: string; technician_name: string | null }

export function Dashboard() {
  const { me } = useMe()
  const today = todayISO()
  const soon = addDays(today, DUE_SOON_DAYS)
  const { data: stats } = useRows<{ customers: number; equipment: number; overdue: number; due_soon: number; drafts: number }>(
    `SELECT
       (SELECT count(*) FROM customers) AS customers,
       (SELECT count(*) FROM equipment WHERE status = 'active') AS equipment,
       (SELECT count(*) FROM equipment WHERE status = 'active' AND next_due_at IS NOT NULL AND substr(next_due_at,1,10) < ?) AS overdue,
       (SELECT count(*) FROM equipment WHERE status = 'active' AND substr(next_due_at,1,10) BETWEEN ? AND ?) AS due_soon,
       (SELECT count(*) FROM calibrations WHERE status = 'draft') AS drafts`,
    [today, today, soon]
  )
  const { data: due } = useRows<DueRowData>(
    `SELECT e.id, e.description, e.serial_number, e.next_due_at, c.name AS customer_name, c.id AS customer_id
     FROM equipment e JOIN customers c ON c.id = e.customer_id
     WHERE e.status = 'active' AND e.next_due_at IS NOT NULL AND substr(e.next_due_at,1,10) <= ?
     ORDER BY e.next_due_at LIMIT 12`,
    [soon]
  )
  const { data: recent } = useRows<RecentRow>(
    `SELECT k.id, k.certificate_number, k.performed_at, k.status, k.as_left_result, k.technician_name,
            e.description, c.name AS customer_name
     FROM calibrations k JOIN equipment e ON e.id = k.equipment_id JOIN customers c ON c.id = k.customer_id
     ORDER BY k.updated_at DESC LIMIT 8`
  )
  const s = stats[0]
  const hello = me?.full_name?.split(' ')[0]

  const tiles = [
    { label: 'Customers', value: s?.customers, icon: Users, to: '/customers', tone: 'text-slate-600 bg-slate-100' },
    { label: 'Active equipment', value: s?.equipment, icon: Wrench, to: '/equipment', tone: 'text-brand-700 bg-brand-50' },
    { label: 'Overdue', value: s?.overdue, icon: AlertTriangle, to: '/equipment?due=overdue', tone: 'text-red-700 bg-red-50' },
    { label: `Due in ${DUE_SOON_DAYS} days`, value: s?.due_soon, icon: CalendarClock, to: '/equipment?due=soon', tone: 'text-amber-700 bg-amber-50' },
    { label: 'Draft calibrations', value: s?.drafts, icon: ClipboardCheck, to: '/calibrations?status=draft', tone: 'text-sky-700 bg-sky-50' }
  ]

  return (
    <>
      <PageHeader title={hello ? `Welcome back, ${hello}` : 'Dashboard'} subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {tiles.map(({ label, value, icon: Icon, to, tone }) => (
          <Link key={label} to={to} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-sm">
            <div className={`mb-3 inline-flex rounded-lg p-2 ${tone}`}><Icon size={18} /></div>
            <div className="text-2xl font-semibold text-slate-900">{value ?? 0}</div>
            <div className="text-xs font-medium text-slate-500">{label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Due & overdue" subtitle={`Next ${DUE_SOON_DAYS} days`} actions={<Link to="/equipment?due=soon" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
          {due.length === 0 ? (
            <EmptyState icon={<CalendarClock size={20} />} title="Nothing due">No active equipment is due in the next {DUE_SOON_DAYS} days.</EmptyState>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {due.map((r) => <DueRow key={r.id} r={r} />)}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent calibrations" actions={<Link to="/calibrations" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
          {recent.length === 0 ? (
            <EmptyState icon={<ClipboardCheck size={20} />} title="No calibrations yet">Open a piece of equipment and click “New calibration”.</EmptyState>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50/60"><tr><th className={th}>Equipment</th><th className={th}>Date</th><th className={th}>Result</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((r) => <RecentRowView key={r.id} r={r} />)}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}

/** Memoized: re-renders only when this row's data changes. */
const DueRow = memo(function DueRow({ r }: { r: DueRowData }) {
  return (
    <tr className="hover:bg-slate-50">
        <td className={td}>
          <Link to={`/equipment/${r.id}`} className="font-medium text-slate-800 hover:text-brand-700">{r.description}</Link>
          <div className="text-xs text-slate-500">{r.customer_name}{r.serial_number ? ` · S/N ${r.serial_number}` : ''}</div>
        </td>
        <td className={`${td} text-right`}><DueBadge date={r.next_due_at} /></td>
      </tr>
  )
})

/** Memoized: re-renders only when this row's data changes. */
const RecentRowView = memo(function RecentRowView({ r }: { r: RecentRow }) {
  return (
    <tr className="hover:bg-slate-50">
        <td className={td}>
          <Link to={`/calibrations/${r.id}`} className="font-medium text-slate-800 hover:text-brand-700">{r.description}</Link>
          <div className="text-xs text-slate-500">{r.customer_name}</div>
        </td>
        <td className={`${td} text-slate-600`}>{fmtDate(r.performed_at)}</td>
        <td className={td}>{r.status === 'draft' ? <span className="text-xs text-slate-500">Draft</span> : <ResultBadge result={r.as_left_result} />}</td>
      </tr>
  )
})
