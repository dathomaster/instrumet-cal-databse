import { describe, expect, it } from 'vitest'
import { buildCalibrationCsv, csvField, csvFileName, type CsvInput } from '@/lib/csv'
import { sectionsFor } from '@/lib/sheets'

const base: CsvInput = {
  org: { name: 'Instrumet' },
  customer: { name: 'Acme, Inc.', address_line1: '1 Main St', city: 'Springfield', state: 'IL', postal_code: '62701', contact_name: 'Jane "JJ" Doe', phone: '555-0100', email: 'jane@acme.test' },
  visit: { visit_date: '2026-11-05', location: 'Test Lab', technician_name: 'Tom' },
  calibration: { certificate_number: 'CAL-20261105-AB12', performed_at: '2026-11-05', due_at: '2027-11-05', technician_name: 'Tom', status: 'completed', result: 'pass', tolerance_pct: '1', notes: 'Line one\nLine two' },
  equipment: { equipment_type: 'load_cell', model: '2580-50kN', serial_number: 'LC-1', capacity: '50', units: 'kN' },
  testFrame: { model: 'Instron 5967', serial_number: 'M-1' },
  standards: [{ name: 'Proving ring', serial_number: 'PR-9', certificate_number: 'C-1', due_at: '2027-06-30' }],
  sections: sectionsFor('load_cell', { modes: ['tension', 'compression'] }, { units: 'kN' }),
  rows: [
    { section: 'tension', seq: 2, nominal: '20', run1: '20.1', run2: '19.9' },
    { section: 'tension', seq: 1, nominal: '10', run1: '10.05', run2: '10' },
    { section: 'tension', seq: 3 } // blank line: left out
  ]
}

describe('csvField', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
    expect(csvField(null)).toBe('')
    expect(csvField(0)).toBe('0')
  })
})

describe('calibration CSV', () => {
  const csv = buildCalibrationCsv(base)
  const lines = csv.replace(/^﻿/, '').split('\r\n')
  it('starts with a BOM so Excel reads ° ± − correctly', () => {
    expect(csv.startsWith('﻿')).toBe(true)
  })
  it('contains the customer, contact, visit and equipment details', () => {
    for (const l of ['Company,"Acme, Inc."', 'City,Springfield', 'ZIP,62701', 'Location,Test Lab', 'Contact name,"Jane ""JJ"" Doe"', 'Contact phone,555-0100', 'Contact email,jane@acme.test', 'Visit date,2026-11-05', 'Calibration date,2026-11-05', 'Equipment type,Load cell', 'Device model,2580-50kN', 'Device SN,LC-1', 'Capacity,50 kN', 'Test frame,Instron 5967 SN M-1', 'Result,PASS', 'Certificate number,CAL-20261105-AB12']) {
      expect(lines).toContain(l)
    }
    expect(lines).toContain('Proving ring,PR-9,C-1,2027-06-30')
  })
  it('has one table per sheet, rows in order, blank lines skipped, with errors and run difference', () => {
    const t = lines.indexOf('Tension')
    expect(lines[t + 1]).toBe('#,Applied (kN),Run 1 indicated (kN),Run 1 % error,Run 2 indicated (kN),Run 2 % error,Run 1 − Run 2 (%),Run 1 pass/fail,Run 2 pass/fail')
    expect(lines[t + 2]).toBe('1,10,10.05,0.50,10,0.00,0.50,PASS,PASS')
    expect(lines[t + 3]).toBe('2,20,20.1,0.50,19.9,-0.50,1.00,PASS,PASS')
    expect(lines[t + 4]).toBe('') // seq 3 was blank
    const c = lines.indexOf('Compression')
    expect(lines[c + 2]).toBe('(no readings)')
  })
  it('keeps multi-line notes in one quoted field', () => {
    expect(csv).toContain('Notes,"Line one\r\nLine two"'.replace('\r\n', '\n'))
  })
  it('crosshead speed sheet shows time, distance, calculated speed and % error', () => {
    const ch = buildCalibrationCsv({
      ...base,
      equipment: { equipment_type: 'crosshead', model: '5967', serial_number: 'M-1', indicator_model: 'Bluehill', indicator_serial: 'I-1' },
      testFrame: null,
      sections: sectionsFor('crosshead', { tests: ['speed'], directions: ['up'], length_units: 'in' }, {}),
      rows: [{ section: 'speed_up', seq: 1, nominal: '2', run1_time: '30', run1_distance: '1.01', run2_time: '30', run2_distance: '0.99' }]
    }).split('\r\n')
    expect(ch).toContain('Machine SN,M-1')
    expect(ch).toContain('Indicating device model,Bluehill')
    const s = ch.indexOf('Speed · Up')
    expect(ch[s + 1]).toBe('#,Target speed (in/min),Run 1 time (s),Run 1 distance (in),Run 1 speed (in/min),Run 1 % error,Run 2 time (s),Run 2 distance (in),Run 2 speed (in/min),Run 2 % error,Run 1 − Run 2 (%),Run 1 pass/fail,Run 2 pass/fail')
    expect(ch[s + 2]).toBe('1,2,30,1.01,2.02,1.00,30,0.99,1.98,-1.00,2.00,PASS,PASS')
  })
  it('file name is safe and descriptive', () => {
    expect(csvFileName(base)).toBe('Acme-Inc._Load-cell_LC-1_2026-11-05_CAL-20261105-AB12.csv')
  })
})
