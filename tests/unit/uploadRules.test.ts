import { describe, expect, it } from 'vitest'
import { clean, isPermanent } from '@/powersync/uploadRules'

describe('which upload errors are given up on (set aside) vs retried', () => {
  it('retries when not signed in — never drops a change for that', () => {
    expect(isPermanent({ status: 401, code: '42501', message: 'permission denied' })).toBe(false)
    expect(isPermanent({ status: 401, code: 'PGRST301', message: 'JWT expired' })).toBe(false)
  })
  it('retries network / server hiccups', () => {
    expect(isPermanent({ message: 'Failed to fetch' })).toBe(false)
    expect(isPermanent({ status: 503, code: '', message: 'Service Unavailable' })).toBe(false)
    expect(isPermanent({ status: 500, code: '57014', message: 'statement timeout' })).toBe(false)
    expect(isPermanent({ status: 503, code: '53300', message: 'too many connections' })).toBe(false)
  })
  it('sets aside changes the server will never accept', () => {
    expect(isPermanent({ status: 403, code: '42501', message: 'row-level security' })).toBe(true) // e.g. removed from company
    expect(isPermanent({ status: 409, code: '23503', message: 'foreign key' })).toBe(true) // parent was deleted
    expect(isPermanent({ status: 400, code: '23502', message: 'not null' })).toBe(true)
    expect(isPermanent({ status: 400, code: '23514', message: 'check constraint' })).toBe(true)
    expect(isPermanent({ status: 400, code: '22P02', message: 'invalid input syntax' })).toBe(true)
  })
})

describe('clean', () => {
  it('turns empty strings into null and keeps everything else', () => {
    expect(clean({ a: '', b: 'x', c: 0, d: null, e: '0' })).toEqual({ a: null, b: 'x', c: 0, d: null, e: '0' })
    expect(clean(undefined)).toEqual({})
  })
})
