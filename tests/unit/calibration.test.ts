import { describe, expect, it } from 'vitest'
import { judge, limits, overallAsFound, overallAsLeft, percentOfTolerance, type PointLike } from '@/lib/calibration'

const pt = (o: Partial<PointLike>): PointLike => ({
  nominal: null, tolerance_minus: null, tolerance_plus: null, as_found: null, as_left: null, ...o
})

describe('limits', () => {
  it('symmetric tolerance when only tol − is given', () => {
    expect(limits(pt({ nominal: '50', tolerance_minus: '0.25' }))).toEqual({ low: 49.75, high: 50.25 })
  })
  it('asymmetric tolerance', () => {
    expect(limits(pt({ nominal: '100', tolerance_minus: '1', tolerance_plus: '2' }))).toEqual({ low: 99, high: 102 })
  })
  it('only tol + given is treated as symmetric', () => {
    expect(limits(pt({ nominal: '10', tolerance_plus: '0.5' }))).toEqual({ low: 9.5, high: 10.5 })
  })
  it('one-sided tolerance with explicit 0', () => {
    expect(limits(pt({ nominal: '10', tolerance_minus: '0', tolerance_plus: '0.5' }))).toEqual({ low: 10, high: 10.5 })
  })
  it('negative tolerance values are treated as magnitudes', () => {
    expect(limits(pt({ nominal: '10', tolerance_minus: '-1' }))).toEqual({ low: 9, high: 11 })
  })
  it('negative nominal (e.g. vacuum, sub-zero temperature)', () => {
    expect(limits(pt({ nominal: '-40', tolerance_minus: '0.5' }))).toEqual({ low: -40.5, high: -39.5 })
  })
  it('no limits without nominal or tolerance', () => {
    expect(limits(pt({ nominal: '10' }))).toBeNull()
    expect(limits(pt({ tolerance_minus: '1' }))).toBeNull()
    expect(limits(pt({ nominal: 'abc', tolerance_minus: '1' }))).toBeNull()
  })
})

describe('judge', () => {
  const p = pt({ nominal: '50', tolerance_minus: '0.25' })
  it('pass inside, fail outside', () => {
    expect(judge('50.1', p)).toBe('pass')
    expect(judge('50.4', p)).toBe('fail')
    expect(judge('49.7', p)).toBe('fail')
  })
  it('exactly on the limit passes, including float noise', () => {
    expect(judge('50.25', p)).toBe('pass')
    expect(judge('49.75', p)).toBe('pass')
    // 0.3 + 0.6 = 0.8999999999999999 in floating point: a reading of exactly
    // 0.9 sits on the upper limit and must pass, not fail on rounding noise
    expect(0.3 + 0.6).toBeLessThan(0.9)
    expect(judge('0.9', pt({ nominal: '0.3', tolerance_minus: '0.6' }))).toBe('pass')
  })
  it('no result for blank or non-numeric readings', () => {
    expect(judge(null, p)).toBeNull()
    expect(judge('', p)).toBeNull()
    expect(judge('n/a', p)).toBeNull()
  })
})

describe('overall results', () => {
  const ok = pt({ nominal: '0', tolerance_minus: '1', as_found: '0.5' })
  const bad = pt({ nominal: '0', tolerance_minus: '1', as_found: '2' })
  it('as found: any failing point fails', () => {
    expect(overallAsFound([ok, ok])).toBe('pass')
    expect(overallAsFound([ok, bad])).toBe('fail')
    expect(overallAsFound([])).toBeNull()
  })
  it('as left: adjusted when it failed as found but passes after adjustment', () => {
    expect(overallAsLeft([ok, { ...bad, as_left: '0.1' }])).toBe('adjusted')
  })
  it('as left: blank as-left means left as found', () => {
    expect(overallAsLeft([ok, ok])).toBe('pass')
    expect(overallAsLeft([ok, bad])).toBe('fail')
  })
  it('as left: still failing after adjustment fails', () => {
    expect(overallAsLeft([{ ...bad, as_left: '1.5' }])).toBe('fail')
  })
})

describe('percentOfTolerance', () => {
  it('reports how much of the band a reading uses', () => {
    const p = pt({ nominal: '100', tolerance_minus: '1', tolerance_plus: '2' })
    expect(percentOfTolerance('101', p)).toBeCloseTo(50)
    expect(percentOfTolerance('99.5', p)).toBeCloseTo(50)
    expect(percentOfTolerance('100', p)).toBeCloseTo(0)
  })
  it('no division by zero for a zero-width band', () => {
    expect(percentOfTolerance('10', pt({ nominal: '10', tolerance_minus: '0', tolerance_plus: '0' }))).toBeNull()
  })
})
