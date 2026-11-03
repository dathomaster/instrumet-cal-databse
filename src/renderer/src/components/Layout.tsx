import { NavLink, Outlet } from 'react-router-dom'
import { Gauge, Users, Wrench, ClipboardCheck, Ruler, Settings, LayoutDashboard } from 'lucide-react'
import { SyncIndicator } from './SyncIndicator'
import { useMe } from '@/lib/hooks'
import { useAuth } from '@/lib/auth'
import { cx } from './ui'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/equipment', label: 'Equipment', icon: Wrench },
  { to: '/calibrations', label: 'Calibrations', icon: ClipboardCheck },
  { to: '/standards', label: 'Reference standards', icon: Ruler },
  { to: '/settings', label: 'Settings', icon: Settings }
]

export function Layout() {
  const { me } = useMe()
  const { user } = useAuth()
  const name = me?.full_name || user?.email || ''
  return (
    <div className="flex h-full">
      <aside className="no-print flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="rounded-lg bg-brand-600 p-1.5 text-white">
            <Gauge size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Instrumet</div>
            <div className="truncate text-xs text-slate-500">{me?.org_name ?? 'Calibration'}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-slate-100 p-4">
          <SyncIndicator />
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">{name}</div>
              <div className="text-xs capitalize text-slate-500">{me?.role ?? ''}</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
