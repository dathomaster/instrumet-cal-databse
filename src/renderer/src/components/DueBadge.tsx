import { Badge } from './ui'
import { daysUntil, dueState, fmtDate } from '@/lib/format'

export function DueBadge({ date, showDate }: { date: string | null | undefined; showDate?: boolean }) {
  const s = dueState(date)
  const n = daysUntil(date)
  if (s === 'none') return <Badge tone="gray">Not calibrated</Badge>
  const when = showDate ? ` · ${fmtDate(date)}` : ''
  if (s === 'overdue') return <Badge tone="red">Overdue {Math.abs(n!)}d{when}</Badge>
  if (s === 'soon') return <Badge tone="amber">{n === 0 ? 'Due today' : `Due in ${n}d`}{when}</Badge>
  return <Badge tone="green">Current{showDate ? ` · ${fmtDate(date)}` : ''}</Badge>
}

export function ResultBadge({ result }: { result: string | null | undefined }) {
  if (!result) return <span className="text-slate-300">—</span>
  const tone = result === 'pass' ? 'green' : result === 'fail' ? 'red' : result === 'adjusted' ? 'blue' : 'amber'
  return <Badge tone={tone}>{result.charAt(0).toUpperCase() + result.slice(1)}</Badge>
}
