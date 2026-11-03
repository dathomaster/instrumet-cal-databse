import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PowerSyncContext, useStatus } from '@powersync/react'
import { Loader2, ShieldAlert } from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { useMe } from '@/lib/hooks'
import { db } from '@/powersync/db'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Customers } from '@/pages/Customers'
import { CustomerDetail } from '@/pages/CustomerDetail'
import { EquipmentList } from '@/pages/EquipmentList'
import { EquipmentDetail } from '@/pages/EquipmentDetail'
import { Calibrations } from '@/pages/Calibrations'
import { CalibrationEditor } from '@/pages/CalibrationEditor'
import { Certificate } from '@/pages/Certificate'
import { Standards } from '@/pages/Standards'
import { Settings } from '@/pages/Settings'

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">{children}</div>
}

/** Wait until we know which company this technician belongs to. */
function Gate() {
  const { me, isLoading } = useMe()
  const status = useStatus()
  const { signOut } = useAuth()
  if (!me) {
    if (isLoading || !status.hasSynced) {
      return (
        <Centered>
          <Loader2 className="animate-spin text-brand-600" size={28} />
          <div className="font-medium text-slate-700">Setting up your workspace…</div>
          <div>Downloading your company’s data so you can work offline.{!navigator.onLine && ' Connect to the internet to finish the first sync.'}</div>
        </Centered>
      )
    }
    return (
      <Centered>
        <ShieldAlert className="text-amber-500" size={28} />
        <div className="font-medium text-slate-700">Your account isn’t part of a company yet</div>
        <div>Ask your administrator to add you, then sign in again.</div>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </Centered>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="equipment" element={<EquipmentList />} />
        <Route path="equipment/:id" element={<EquipmentDetail />} />
        <Route path="calibrations" element={<Calibrations />} />
        <Route path="calibrations/:id" element={<CalibrationEditor />} />
        <Route path="calibrations/:id/certificate" element={<Certificate />} />
        <Route path="standards" element={<Standards />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function Shell() {
  const { user, needsSignIn } = useAuth()
  if (!user) return <Login />
  if (needsSignIn) return <Login reauth />
  // key: remount everything if the signed-in user changes
  return <Gate key={user.id} />
}

export default function App() {
  return (
    <PowerSyncContext.Provider value={db}>
      <AuthProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </AuthProvider>
    </PowerSyncContext.Provider>
  )
}
