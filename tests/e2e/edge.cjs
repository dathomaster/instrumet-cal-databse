// Edge cases + CSV + service report (seed rows created by scripts/e2e.mjs).
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const h = require('./helpers.cjs')

const MAIN = '#/calibrations/ca000000-0000-0000-0000-0000000000e3'   // draft, readings filled, uses a standard
const EMPTY = '#/calibrations/ca000000-0000-0000-0000-0000000000e4'  // draft, a line missing run 2
const EQUIP = '#/equipment/e0000000-0000-0000-0000-0000000000e3'     // Edge load cell (on Edge Frame)
const VISIT = '#/visits/dddddddd-0000-0000-0000-0000000000e3'
const DOOMED_VISIT = '#/visits/dddddddd-0000-0000-0000-0000000000e5' // B deletes it while A works in it offline

const fmt = (c, iso) => c.page.evaluate((d) => {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}, iso)
const plusDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const detail = async (c, label) => (await c.page.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]').innerText()).trim()
const tile = async (c, label, { atLeast = 0 } = {}) => {
  const el = c.page.locator('a', { hasText: label }).locator('div.text-2xl')
  for (let i = 0; i < 40; i++) { const v = parseInt(await el.innerText(), 10); if (v >= atLeast) return v; await c.page.waitForTimeout(250) }
  return parseInt(await el.innerText(), 10)
}

h.run('EDGE', async () => {
  const A = await h.launch('A', { viaRelay: true })
  const B = await h.launch('B')
  await h.signIn(A, h.TECH1); await h.signIn(B, h.TECH2)
  const today = await A.page.evaluate(() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) })

  // 1. Only one copy of the app can run on the same data
  const second = spawn(require(path.join(h.APP, 'node_modules', 'electron')), [path.join(h.APP, 'out/main/index.js'), '--no-sandbox', `--user-data-dir=${path.join(process.env.TMPROOT, 'userdata-A')}`], { stdio: 'ignore' })
  const exited = await new Promise((r) => { const t = setTimeout(() => r(false), 15000); second.on('exit', () => { clearTimeout(t); r(true) }) })
  if (!exited) second.kill()
  h.check(exited, 'a second copy of the app kept running on the same data')
  h.log('second launch exits; first copy keeps running')

  // 2. A required field can't be saved empty
  await h.goto(A, MAIN); await A.page.getByTestId('sheet-tension').waitFor()
  const date = A.page.getByLabel('Date performed')
  const before = await date.inputValue()
  await date.fill(''); await date.blur(); await A.page.waitForTimeout(500) // (Tab moves between date parts)
  h.check((await date.inputValue()) === before, 'clearing "Date performed" was not reverted')
  h.log('clearing a required field puts the saved value back')

  // 3. Completing with a line missing a run asks first
  await h.goto(A, EMPTY); await A.page.getByTestId('sheet-tension').waitFor()
  let asked = ''
  A.page.once('dialog', (d) => { asked = d.message(); d.dismiss() })
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.waitForTimeout(800)
  h.check(/a missing run/.test(asked), `no warning before completing with a missing run (got: "${asked}")`)
  h.check(await A.page.getByText('Draft', { exact: true }).first().isVisible(), 'calibration completed despite cancelling')
  h.log('completing with a missing run asks first; cancel keeps it a draft')

  // 4. Completion sets the result and equipment dates; correcting the date recalculates them
  await h.goto(A, MAIN); await A.page.getByTestId('sheet-tension').waitFor()
  await A.page.locator('[data-testid="cell-tension-1-run1"][value="10.05"]').waitFor({ timeout: 15000 })
  const err1 = await A.page.getByTestId('cell-tension-1-err1').innerText()
  h.check(err1 === '0.50', `run 1 % error wrong (10.05 vs 10): got "${err1}"`)
  h.check((await A.page.getByTestId('cell-tension-1-diff').innerText()) === '0.70', 'run difference wrong (0.50 − (−0.20))')
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.getByText('Completed', { exact: true }).first().waitFor()
  await h.goto(A, EQUIP); await A.page.getByText('Calibration history').waitFor()
  h.check((await detail(A, 'Next due')) === (await fmt(A, plusDays(today, 365))), 'equipment next due not set from completion')
  await h.goto(A, MAIN); await A.page.getByRole('button', { name: 'Reopen to edit' }).click()
  await A.page.getByRole('button', { name: 'Complete calibration' }).waitFor()
  h.check((await A.page.getByLabel(/^Due date/).inputValue()) === '', 'calculated due date was not cleared on reopen')
  await A.page.getByLabel('Date performed').fill('2026-01-15'); await A.page.getByLabel('Date performed').blur()
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.getByText('Completed', { exact: true }).first().waitFor()
  await h.goto(A, EQUIP); await A.page.getByText('Calibration history').waitFor(); await A.page.waitForTimeout(500)
  h.check((await detail(A, 'Last calibrated')) === (await fmt(A, '2026-01-15')), 'last calibrated not corrected backwards')
  h.check((await detail(A, 'Next due')) === (await fmt(A, '2027-01-15')), 'next due not recalculated after correcting the date')
  h.log('completion sets equipment dates; correcting the date backwards recalculates them')

  // 5. CSV: everything about the job, plus the readings
  const csvPath = path.join(process.env.TMPROOT, 'export.csv')
  await A.app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }) }, csvPath)
  await h.goto(A, MAIN); await A.page.getByTestId('sheet-tension').waitFor()
  await A.page.getByRole('button', { name: 'Save CSV' }).click()
  await A.page.getByTestId('csv-saved').waitFor({ timeout: 10000 })
  const csv = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').split('\r\n')
  for (const l of ['Company,Edge Co', 'City,Springfield', 'Location,Test Lab', 'Contact name,Pat Lee', 'Contact phone,555-0199', 'Contact email,pat@edge.test',
    'Calibration date,2026-01-15', 'Equipment type,Load cell', 'Device model,EDGE-LC', 'Device SN,LC-E3', 'Capacity,50 kN', 'Test frame,Edge Frame SN F-1',
    'Result,PASS', 'Tolerance (±%),1', 'Edge Calibrator,S-1,C-1,2027-06-30', 'Tension',
    '1,10,10.05,0.50,9.98,-0.20,0.70,PASS,PASS', '2,20,20.1,0.50,20.04,0.20,0.30,PASS,PASS']) {
    h.check(csv.includes(l), `CSV is missing line: ${l}`)
  }
  h.check(csv.filter((l) => /^\d+,/.test(l)).length === 2, 'CSV should only contain the 2 filled lines')
  h.log(`CSV saved with customer, contact, equipment, test frame, standards and readings (${csv.length} lines)`)

  // 6. Certificates keep the standard's details as of completion
  await h.goto(A, MAIN + '/certificate'); await A.page.getByText('Certificate of Calibration').waitFor()
  h.check(await A.page.getByText('Cert C-1').isVisible(), 'certificate missing the standard')
  await h.nav(A, 'Reference standards')
  const stdRow = A.page.getByRole('row').filter({ hasText: 'Edge Calibrator' })
  await stdRow.hover(); await stdRow.getByRole('button', { name: 'Edit' }).click()
  await A.page.getByRole('dialog').getByLabel('Cal certificate #').fill('C-2')
  await A.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await h.goto(A, MAIN + '/certificate'); await A.page.getByText('Certificate of Calibration').waitFor()
  h.check(await A.page.getByText('Cert C-1').isVisible(), 'old certificate changed when the standard was updated')
  h.log('certificate keeps the standard as of completion')

  // 7. Service report: calibrations performed + notes
  await h.goto(A, VISIT); await A.page.getByLabel('Service report notes').waitFor()
  await A.page.getByLabel('Service report notes').fill('Cleaned crosshead screws. Load cell cable worn — recommend replacement.')
  await A.page.getByLabel('Service report notes').blur()
  await A.page.getByRole('button', { name: 'Service report' }).click()
  await A.page.getByText('Service Report', { exact: true }).waitFor()
  const report = await A.page.getByTestId('report-calibrations').innerText()
  h.check(/LC-E3/.test(report) && /CAL-EDGE-MAIN/.test(report) && /PASS/.test(report), 'service report missing the completed calibration')
  h.check(/In progress/.test(report), 'service report missing the in-progress calibration')
  h.check(/recommend replacement/.test(await A.page.getByTestId('report-notes').innerText()), 'service report missing the notes')
  h.log('service report lists the calibrations performed and the notes')

  // 8 + 9. Offline: cascade delete updates counts at once; work inside a visit a
  //        colleague deleted is set aside, and the upload queue doesn't get stuck
  await h.goto(A, DOOMED_VISIT); await A.page.getByRole('button', { name: 'Start new calibration' }).first().waitFor()
  h.setNetwork(false); await h.browserOffline(A, true)
  await A.page.getByTestId('sync-indicator').filter({ hasText: 'Offline' }).first().waitFor({ timeout: 30000 })
  await A.page.getByRole('button', { name: 'Start new calibration' }).first().click()
  await A.page.getByRole('dialog', { name: 'Start new calibration' }).getByLabel('Equipment').selectOption({ label: 'Load cell · EDGE-LC · SN LC-E3' })
  await A.page.getByRole('dialog', { name: 'Start new calibration' }).getByRole('button', { name: 'Start calibration' }).click()
  await A.page.getByTestId('sheet-tension').waitFor()
  h.check((await A.page.getByTestId('cell-tension-1-nominal').inputValue()) === '10', 'applied values were not copied from the previous calibration')
  h.log("A (offline) started a calibration in a visit; applied values copied from last time")

  await h.goto(B, DOOMED_VISIT); await B.page.getByRole('button', { name: 'Start new calibration' }).first().waitFor()
  await B.page.getByRole('button', { name: 'Delete' }).first().click()
  await B.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await B.page.getByRole('heading', { name: 'Visits' }).waitFor()
  h.log('B deleted that visit')

  await h.nav(A, 'Dashboard')
  const eqBefore = await tile(A, 'Active equipment', { atLeast: 3 }) // Edge LC + Edge Frame + Delete Me Gauge
  await h.nav(A, 'Customers'); await A.page.getByText('Delete Me Co').first().click()
  await A.page.getByRole('button', { name: 'Delete' }).first().click()
  await A.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await A.page.getByRole('heading', { name: 'Customers' }).waitFor()
  await h.nav(A, 'Dashboard'); await A.page.waitForTimeout(1500)
  const eqAfter = await tile(A, 'Active equipment')
  h.check(eqAfter === eqBefore - 1, `offline delete left equipment counted (${eqBefore} -> ${eqAfter})`)
  h.log(`offline customer delete updated the dashboard at once (${eqBefore} -> ${eqAfter} active equipment)`)

  h.setNetwork(true); await h.browserOffline(A, false)
  await h.nav(A, 'Settings')
  await A.page.getByTestId('pending-count').filter({ hasText: /^0$/ }).waitFor({ timeout: 90000 })
  await A.page.getByText('Changes the server rejected').waitFor({ timeout: 30000 })
  h.check(await A.page.getByRole('row').filter({ hasText: /calibrations/ }).first().isVisible(), 'rejected calibration not listed')
  h.log("A reconnected: work in the deleted visit is listed as rejected; queue drained (0 pending)")
  await h.nav(B, 'Equipment'); await B.page.waitForTimeout(3000)
  h.check(!(await B.page.getByText('Delete Me Gauge').isVisible()), "the deleted customer's equipment still exists for B")
  h.log("B no longer sees the deleted customer's equipment")
  await A.app.close(); await B.app.close()
})
