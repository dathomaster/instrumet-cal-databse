// Edge cases found in the code audit (seed rows created by scripts/e2e.mjs).
const { spawn } = require('child_process')
const path = require('path')
const h = require('./helpers.cjs')

const MAIN = '#/calibrations/ca000000-0000-0000-0000-0000000000e3'   // draft, readings filled, uses standard
const EMPTY = '#/calibrations/ca000000-0000-0000-0000-0000000000e4'  // draft, a point with no reading
const DOOMED = '#/calibrations/ca000000-0000-0000-0000-0000000000e5' // B deletes while A adds to it offline
const EQUIP = '#/equipment/e0000000-0000-0000-0000-0000000000e3'

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
  h.check(await A.page.getByText('Instrumet').first().isVisible(), 'first copy stopped working')
  h.log('second launch exits; first copy keeps running')

  // 2. A required field can't be saved empty
  await h.goto(A, MAIN); await A.page.getByTestId('points-table').waitFor()
  const date = A.page.getByLabel('Date performed')
  const before = await date.inputValue()
  // (Tab moves between the month/day/year parts of a date box, so blur explicitly)
  await date.fill(''); await date.blur(); await A.page.waitForTimeout(500)
  h.check((await date.inputValue()) === before, 'clearing "Date performed" was not reverted')
  h.log('clearing a required field puts the saved value back')

  // 3. Completing with an empty reading asks first
  await h.goto(A, EMPTY); await A.page.getByTestId('points-table').waitFor()
  let asked = ''
  A.page.once('dialog', (d) => { asked = d.message(); d.dismiss() })
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.waitForTimeout(800)
  h.check(/no as-found reading/.test(asked), 'no warning before completing with an empty reading')
  h.check(await A.page.getByText('Draft', { exact: true }).first().isVisible(), 'calibration completed despite cancelling')
  h.log('completing with an empty reading asks first; cancel keeps it a draft')

  // 4. Completion sets equipment dates; correcting the date later recalculates them
  await h.goto(A, MAIN); await A.page.getByTestId('points-table').waitFor()
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.getByText('Completed', { exact: true }).waitFor()
  await h.goto(A, EQUIP); await A.page.getByText('Calibration history').waitFor()
  h.check((await detail(A, 'Next due')) === (await fmt(A, plusDays(today, 365))), 'equipment next due not set from completion')
  await h.goto(A, MAIN); await A.page.getByRole('button', { name: 'Reopen to edit' }).click()
  await A.page.getByRole('button', { name: 'Complete calibration' }).waitFor()
  h.check((await A.page.getByLabel(/^Due date/).inputValue()) === '', 'calculated due date was not cleared on reopen')
  await A.page.getByLabel('Date performed').fill('2026-01-15'); await A.page.getByLabel('Date performed').blur()
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.getByText('Completed', { exact: true }).waitFor()
  await h.goto(A, EQUIP); await A.page.getByText('Calibration history').waitFor()
  await A.page.waitForTimeout(500)
  h.check((await detail(A, 'Last calibrated')) === (await fmt(A, '2026-01-15')), 'last calibrated not corrected backwards')
  h.check((await detail(A, 'Next due')) === (await fmt(A, '2027-01-15')), 'next due not recalculated after correcting the date')
  h.log('correcting a calibration date backwards recalculates the equipment dates')

  // 5. Certificates keep the standard's details as of completion
  await h.goto(A, MAIN + '/certificate'); await A.page.getByText('Certificate of Calibration').waitFor()
  h.check(await A.page.getByText('Cert C-1').isVisible(), 'certificate missing the standard')
  await h.nav(A, 'Reference standards')
  const stdRow = A.page.getByRole('row').filter({ hasText: 'Edge Calibrator' })
  await stdRow.hover(); await stdRow.getByRole('button', { name: 'Edit' }).click()
  await A.page.getByRole('dialog').getByLabel('Cal certificate #').fill('C-2')
  await A.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await h.goto(A, MAIN + '/certificate'); await A.page.getByText('Certificate of Calibration').waitFor()
  h.check(await A.page.getByText('Cert C-1').isVisible(), 'old certificate changed when the standard was updated')
  await h.nav(A, 'Reference standards')
  A.page.once('dialog', (d) => d.accept())
  await stdRow.hover(); await stdRow.getByRole('button', { name: 'Delete' }).click()
  await A.page.getByText('Edge Calibrator').waitFor({ state: 'detached' })
  await h.goto(A, MAIN + '/certificate'); await A.page.getByText('Certificate of Calibration').waitFor()
  h.check(await A.page.getByText('Edge Calibrator').isVisible(), 'certificate lost the standard after it was deleted')
  h.log('certificate keeps the standard as of completion (after edit and delete)')

  // 6 + 7. Offline: cascade delete updates counts at once; an edit to something
  //         deleted by a colleague is set aside, and the queue doesn't get stuck
  await h.goto(A, DOOMED); await A.page.getByTestId('points-table').waitFor()
  h.setNetwork(false); await h.browserOffline(A, true)
  await A.page.getByTestId('sync-indicator').filter({ hasText: 'Offline' }).first().waitFor({ timeout: 30000 })
  await A.page.getByRole('button', { name: 'Add measurement point' }).click()
  const n = A.page.getByTestId('points-table').locator('tbody tr').nth(0).locator('input').nth(2)
  await n.fill('42'); await n.press('Tab')

  await h.goto(B, DOOMED); await B.page.getByTestId('points-table').waitFor()
  await B.page.getByRole('button', { name: 'Delete' }).first().click()
  await B.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await B.page.getByText('Calibration history').waitFor()
  h.log('B deleted the calibration A is adding to offline')

  await h.nav(A, 'Dashboard')
  const eqBefore = await tile(A, 'Active equipment', { atLeast: 2 }) // Edge Gauge + Delete Me Gauge
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
  h.check(await A.page.getByRole('row').filter({ hasText: 'calibration points' }).first().isVisible(), 'rejected point not listed')
  h.log("A reconnected: the point added to B's deleted calibration is listed as rejected; queue drained (0 pending)")
  await h.nav(B, 'Equipment')
  await B.page.waitForTimeout(3000)
  h.check(!(await B.page.getByText('Delete Me Gauge').isVisible()), "the deleted customer's equipment still exists for B")
  h.log("B no longer sees the deleted customer's equipment")
  await A.app.close(); await B.app.close()
})
