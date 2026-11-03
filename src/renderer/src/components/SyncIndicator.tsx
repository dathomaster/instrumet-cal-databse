import { useStatus } from '@powersync/react'
import { CloudOff, RefreshCw, CheckCircle2, AlertTriangle, UploadCloud } from 'lucide-react'
import { useOnline, usePendingUploads } from '@/lib/hooks'
import { cx } from './ui'

export function SyncIndicator({ compact }: { compact?: boolean }) {
  const status = useStatus()
  const online = useOnline()
  const pending = usePendingUploads()
  const { uploading, downloading, uploadError, downloadError } = status.dataFlowStatus

  let icon = <CheckCircle2 size={15} />
  let label = 'All changes synced'
  let tone = 'text-emerald-700 bg-emerald-50'

  // "Offline" = we can't reach the sync server, whatever the OS says
  // (e.g. customer Wi-Fi with no internet still reports navigator.onLine).
  const networkFailure = (e?: Error) => !!e && /fetch|network|socket|timed? ?out/i.test(e.message)
  const unreachable =
    (!status.connected && (!!downloadError || !status.connecting)) || networkFailure(uploadError) || networkFailure(downloadError)
  if (!online || unreachable) {
    icon = <CloudOff size={15} />
    label = pending ? `Offline · ${pending} change${pending === 1 ? '' : 's'} saved locally` : 'Offline · working locally'
    tone = 'text-slate-600 bg-slate-100'
  } else if (status.connecting && !status.connected) {
    icon = <RefreshCw size={15} className="animate-spin" />
    label = 'Connecting…'
    tone = 'text-sky-700 bg-sky-50'
  } else if (uploadError || downloadError) {
    icon = <AlertTriangle size={15} />
    label = pending ? `Sync retrying · ${pending} pending` : 'Sync retrying…'
    tone = 'text-amber-700 bg-amber-50'
  } else if (uploading || downloading || pending > 0) {
    icon = pending > 0 ? <UploadCloud size={15} /> : <RefreshCw size={15} className="animate-spin" />
    label = pending > 0 ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…` : 'Syncing…'
    tone = 'text-sky-700 bg-sky-50'
  } else if (!status.hasSynced) {
    icon = <RefreshCw size={15} className="animate-spin" />
    label = 'Downloading data…'
    tone = 'text-sky-700 bg-sky-50'
  }

  const title = [
    label,
    status.lastSyncedAt ? `Last synced ${status.lastSyncedAt.toLocaleString()}` : null,
    uploadError ? `Upload: ${uploadError.message}` : null,
    downloadError ? `Download: ${downloadError.message}` : null
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      data-testid="sync-indicator"
      data-connected={String(status.connected)}
      data-connecting={String(status.connecting)}
      data-upload-error={uploadError ? 'true' : 'false'}
      data-download-error={downloadError ? 'true' : 'false'}
      title={title} className={cx('flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium', tone)}>
      {icon}
      {!compact && <span className="truncate">{label}</span>}
    </div>
  )
}
