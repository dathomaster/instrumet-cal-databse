import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, dateOnly, daysUntil, dueState, newCertificateNumber, num } from '@/lib/format'

describe('dates', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('dateOnly handles ISO, Postgres timestamps and empty values', () => {
    expect(dateOnly('2026-11-03')).toBe('2026-11-03')
    expect(dateOnly('2026-11-03T23:59:59.000Z')).toBe('2026-11-03')
    expect(dateOnly('2026-11-03 00:00:00+00')).toBe('2026-11-03')
    expect(dateOnly(null)).toBe('')
    expect(dateOnly(undefined)).toBe('')
  })
  it('addDays across month ends, leap years and DST changes', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // leap year
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08') // US DST start
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02') // US DST end
    expect(addDays('2026-11-03', 365)).toBe('2027-11-03')
    expect(addDays('2026-11-03 00:00:00+00', 30)).toBe('2026-12-03')
  })
  it('due state boundaries', () => {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0)) // 3 Nov 2026, local noon
    expect(dueState(null)).toBe('none')
    expect(dueState('2026-11-02')).toBe('overdue')
    expect(daysUntil('2026-11-02')).toBe(-1)
    expect(dueState('2026-11-03')).toBe('soon') // due today
    expect(dueState('2026-12-03')).toBe('soon') // exactly 30 days
    expect(dueState('2026-12-04')).toBe('ok')
  })
  it('due date is a calendar date regardless of time of day', () => {
    vi.setSystemTime(new Date(2026, 10, 3, 23, 59))
    expect(dueState('2026-11-03 00:00:00+00')).toBe('soon')
    vi.setSystemTime(new Date(2026, 10, 4, 0, 1))
    expect(dueState('2026-11-03 00:00:00+00')).toBe('overdue')
  })
})

describe('num', () => {
  it('parses numbers and rejects junk', () => {
    expect(num('1.5')).toBe(1.5)
    expect(num('-0.25')).toBe(-0.25)
    expect(num(0)).toBe(0)
    expect(num('')).toBeNull()
    expect(num(null)).toBeNull()
    expect(num('abc')).toBeNull()
    expect(num('Infinity')).toBeNull()
  })
})

describe('certificate numbers', () => {
  it('have the expected shape and do not repeat in a batch', () => {
    const many = new Set(Array.from({ length: 500 }, () => newCertificateNumber()))
    for (const c of many) expect(c).toMatch(/^CAL-\d{8}-[0-9A-Z]{4}$/)
    expect(many.size).toBeGreaterThan(495)
  })
})
