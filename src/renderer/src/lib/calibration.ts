import { num } from './format'

export type PointResult = 'pass' | 'fail' | null

export interface PointLike {
  nominal: string | null
  tolerance_minus: string | null
  tolerance_plus: string | null
  as_found: string | null
  as_left: string | null
}

/** Allowed window for a point: [nominal - tol_minus, nominal + tol_plus]. */
export function limits(p: PointLike): { low: number; high: number } | null {
  const n = num(p.nominal)
  const minus = num(p.tolerance_minus)
  const plus = num(p.tolerance_plus) ?? minus
  if (n === null || (minus === null && plus === null)) return null
  return { low: n - Math.abs(minus ?? plus ?? 0), high: n + Math.abs(plus ?? 0) }
}

export function judge(value: string | null, p: PointLike): PointResult {
  const v = num(value)
  const l = limits(p)
  if (v === null || !l) return null
  // Small epsilon so 9.9999999 vs 10 float noise doesn't fail a reading on the limit
  const eps = 1e-9 * Math.max(1, Math.abs(l.low), Math.abs(l.high))
  return v >= l.low - eps && v <= l.high + eps ? 'pass' : 'fail'
}

/** Error of a reading relative to nominal, as % of the tolerance band used. */
export function percentOfTolerance(value: string | null, p: PointLike): number | null {
  const v = num(value)
  const n = num(p.nominal)
  const l = limits(p)
  if (v === null || n === null || !l) return null
  const err = v - n
  const band = err >= 0 ? l.high - n : n - l.low
  if (band === 0) return null
  return (Math.abs(err) / band) * 100
}

export function overallAsFound(points: PointLike[]): 'pass' | 'fail' | null {
  const r = points.map((p) => judge(p.as_found, p)).filter(Boolean)
  if (!r.length) return null
  return r.includes('fail') ? 'fail' : 'pass'
}

export function overallAsLeft(points: PointLike[]): 'pass' | 'fail' | 'adjusted' | null {
  // A point with no as-left reading was left as found.
  const r = points.map((p) => judge(p.as_left ?? p.as_found, p)).filter(Boolean)
  if (!r.length) return null
  if (r.includes('fail')) return 'fail'
  return overallAsFound(points) === 'fail' ? 'adjusted' : 'pass'
}
