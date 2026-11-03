/** Dates are stored as ISO / Postgres timestamp text. We only ever care about
 *  the calendar day, so work with the first 10 chars to avoid timezone shifts. */
export function dateOnly(s: string | null | undefined): string {
  return s ? s.slice(0, 10) : ''
}

export function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

export function addDays(day: string, days: number): string {
  const d = new Date(day.slice(0, 10) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function fmtDate(s: string | null | undefined): string {
  const d = dateOnly(s)
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function daysUntil(s: string | null | undefined): number | null {
  const d = dateOnly(s)
  if (!d) return null
  const a = new Date(d + 'T00:00:00Z').getTime()
  const b = new Date(todayISO() + 'T00:00:00Z').getTime()
  return Math.round((a - b) / 86400000)
}

export type DueState = 'overdue' | 'soon' | 'ok' | 'none'
export const DUE_SOON_DAYS = 30

export function dueState(nextDue: string | null | undefined): DueState {
  const n = daysUntil(nextDue)
  if (n === null) return 'none'
  if (n < 0) return 'overdue'
  if (n <= DUE_SOON_DAYS) return 'soon'
  return 'ok'
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export function newCertificateNumber(): string {
  const d = todayISO().replace(/-/g, '')
  const r = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `CAL-${d}-${r}`
}

export function joinNonEmpty(parts: (string | null | undefined)[], sep = ', '): string {
  return parts.filter((p) => p && String(p).trim()).join(sep)
}
