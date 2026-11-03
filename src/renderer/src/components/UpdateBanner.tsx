import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { desktop } from '@/lib/desktop'
import { Button } from './ui'

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => desktop()?.onUpdateReady(setVersion), [])
  if (!version) return null
  return (
    <div className="no-print flex items-center gap-3 border-b border-brand-100 bg-brand-50 px-8 py-2.5 text-sm text-brand-700">
      <Download size={16} className="shrink-0" />
      <span className="flex-1">Version {version} is ready. Your work is saved — restart whenever convenient (it also installs next time you close the app).</span>
      <Button size="sm" onClick={() => desktop()?.installUpdate()}>Restart to update</Button>
    </div>
  )
}
