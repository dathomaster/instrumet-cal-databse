import { describe, expect, it } from 'vitest'
import { equipmentLabel, evaluateRow, isIncomplete, overallResult, pctError, sectionsFor, speedPerMin, withinTolerance } from '@/lib/sheets'

describe('sheets for each equipment type', () => {
  it('load cell: one 20-row sheet per mode, default tension', () => {
    expect(sectionsFor('load_cell', {}, { units: 'kN' }).map((s) => [s.key, s.rows, s.units])).toEqual([['tension', 20, 'kN']])
    const both = sectionsFor('load_cell', { modes: ['tension', 'compression'] }, { units: 'lbf' })
    expect(both.map((s) => s.title)).toEqual(['Tension', 'Compression'])
    expect(both.every((s) => s.kind === 'reading' && s.appliedLabel === 'Applied' && s.readingLabel === 'Indicated')).toBe(true)
  })
  it('extensometer: one 20-row sheet (Device / Indicated) in gauge-length units', () => {
    const [s] = sectionsFor('extensometer', {}, { gauge_length_units: 'mm' })
    expect([s.key, s.rows, s.appliedLabel, s.readingLabel, s.units]).toEqual(['main', 20, 'Device', 'Indicated', 'mm'])
  })
  it('crosshead: 5-row sheets for each test × direction chosen', () => {
    const all = sectionsFor('crosshead', { tests: ['displacement', 'speed'], directions: ['up', 'down'], length_units: 'mm' }, {})
    expect(all.map((s) => s.key)).toEqual(['displacement_up', 'displacement_down', 'speed_up', 'speed_down'])
    expect(all.every((s) => s.rows === 5)).toBe(true)
    expect(all.find((s) => s.key === 'speed_up')).toMatchObject({ kind: 'speed', units: 'mm/min', lengthUnits: 'mm' })
    expect(sectionsFor('crosshead', { tests: ['speed'], directions: ['down'] }, {}).map((s) => s.key)).toEqual(['speed_down'])
  })
  it('unknown type has no sheets', () => {
    expect(sectionsFor('scale', {}, {})).toEqual([])
  })
})

describe('maths', () => {
  it('% error against the applied value', () => {
    expect(pctError(1010, 1000)).toBeCloseTo(1)
    expect(pctError(990, 1000)).toBeCloseTo(-1)
    expect(pctError(5, 0)).toBeNull() // no division by zero
    expect(pctError(null, 10)).toBeNull()
  })
  it('speed from time and distance, per minute', () => {
    expect(speedPerMin(30, 1)).toBeCloseTo(2) // 1 in in 30 s = 2 in/min
    expect(speedPerMin(0, 1)).toBeNull()
    expect(speedPerMin(null, 1)).toBeNull()
  })
  it('row evaluation: both runs and their difference', () => {
    const r = evaluateRow({ nominal: '1000', run1: '1010', run2: '1004' }, 'reading')
    expect(r.e1).toBeCloseTo(1.0)
    expect(r.e2).toBeCloseTo(0.4)
    expect(r.diff).toBeCloseTo(0.6) // = (1010 − 1004) / 1000 × 100
  })
  it('speed row: target vs measured from time/distance', () => {
    const r = evaluateRow({ nominal: '2', run1_time: '30', run1_distance: '1.01', run2_time: '30', run2_distance: '0.99' }, 'speed')
    expect(r.r1).toBeCloseTo(2.02)
    expect(r.e1).toBeCloseTo(1)
    expect(r.e2).toBeCloseTo(-1)
    expect(r.diff).toBeCloseTo(2)
  })
  it('tolerance check, including a reading exactly on the limit', () => {
    expect(withinTolerance(1.0, 1)).toBe(true)
    expect(withinTolerance(-1.0, 1)).toBe(true)
    expect(withinTolerance(pctError(10.1, 10), 1)).toBe(true) // 0.99999… or 1.00000…1 from float maths
    expect(withinTolerance(1.01, 1)).toBe(false)
    expect(withinTolerance(null, 1)).toBeNull()
  })
})

describe('completeness and overall result', () => {
  const sections = sectionsFor('load_cell', { modes: ['tension', 'compression'] }, { units: 'kN' })
  it('a line with an applied value but a missing run is incomplete; blank lines are fine', () => {
    expect(isIncomplete({ nominal: '10', run1: '10' }, 'reading')).toBe(true)
    expect(isIncomplete({ nominal: '10', run1: '10', run2: '10' }, 'reading')).toBe(false)
    expect(isIncomplete({}, 'reading')).toBe(false)
    expect(isIncomplete({ nominal: '2', run1_time: '30', run1_distance: '1', run2_time: '30' }, 'speed')).toBe(true)
  })
  it('fails if any run of any sheet is out of tolerance', () => {
    const ok = [{ section: 'tension', nominal: '10', run1: '10.05', run2: '9.95' }]
    expect(overallResult(ok, sections, 1)).toBe('pass')
    expect(overallResult([...ok, { section: 'compression', nominal: '10', run1: '10', run2: '10.2' }], sections, 1)).toBe('fail')
    expect(overallResult([], sections, 1)).toBeNull()
    // readings on a sheet that isn't part of this calibration are ignored
    expect(overallResult([{ section: 'speed_up', nominal: '10', run1: '99', run2: '99' }], sections, 1)).toBeNull()
  })
})

describe('equipmentLabel', () => {
  it('uses type, model (or description) and SN', () => {
    expect(equipmentLabel({ equipment_type: 'load_cell', model: '2580-50kN', serial_number: 'LC-1' })).toBe('Load cell · 2580-50kN · SN LC-1')
    expect(equipmentLabel({ equipment_type: 'crosshead', model: '5967', description: 'Frame #2' })).toBe('Crosshead · Frame #2')
  })
})
