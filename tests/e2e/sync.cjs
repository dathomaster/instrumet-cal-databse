// Two laptops through the real workflow: visit -> customer -> equipment ->
// sheets, online and offline; live sync, reconnect, live correction, restart offline.
const h = require('./helpers.cjs')

const fill = async (c, testid, v) => { const el = c.page.getByTestId(testid); await el.fill(v); await el.press('Tab') }
/** Wait (up to 10 s) for a computed cell to show the expected text; report what it showed if not. */
async function expectText(c, testid, want) {
  const el = c.page.getByTestId(testid)
  for (let i = 0; i < 40; i++) { if ((await el.innerText()) === want) return; await c.page.waitForTimeout(250) }
  throw new Error(`${testid}: expected "${want}", got "${await el.innerText()}"`)
}

h.run('SYNC', async () => {
  const A = await h.launch('A', { viaRelay: true })
  const B = await h.launch('B')
  await h.signIn(A, h.TECH1); await h.signIn(B, h.TECH2)

  // --- New visit with a new customer
  await A.page.getByRole('button', { name: 'New visit' }).first().click()
  await A.page.getByRole('dialog', { name: 'New visit' }).getByRole('button', { name: 'New customer' }).click()
  const cf = A.page.getByRole('dialog', { name: 'New customer' })
  await cf.getByLabel('Company name *').fill('Acme Labs')
  await cf.getByLabel('Street').fill('1 Main St')
  await cf.getByLabel('City').fill('Springfeild') // typo, fixed later while offline
  await cf.getByLabel('ZIP').fill('62701')
  h.check((await cf.getByLabel('Specific location').inputValue()) === 'Test Lab', 'specific location does not default to Test Lab')
  await cf.getByLabel('Contact name').fill('Jane Doe')
  await cf.getByLabel('Contact phone').fill('555-0100')
  await cf.getByLabel('Contact email').fill('jane@acme.test')
  await cf.getByRole('button', { name: 'Save' }).click()
  await A.page.getByRole('dialog', { name: 'New visit' }).getByRole('button', { name: 'Start visit' }).click()
  await A.page.getByRole('heading', { name: /Acme Labs/ }).waitFor()
  h.log('A started a visit for a new customer (location defaulted to Test Lab)')

  // --- Crosshead: add it from the start-calibration dialog, speed + displacement, up
  await A.page.getByRole('button', { name: 'Start new calibration' }).first().click()
  await A.page.getByRole('dialog', { name: 'Start new calibration' }).getByRole('button', { name: 'Add new' }).click()
  const ef = A.page.getByRole('dialog', { name: 'Add equipment' })
  await ef.getByLabel('Equipment type *').selectOption('crosshead')
  await ef.getByLabel('Machine model', { exact: true }).fill('5967')
  await ef.getByLabel('Machine SN', { exact: true }).fill('M-1')
  await ef.getByLabel('Indicating device model', { exact: true }).fill('Bluehill')
  await ef.getByLabel('Indicating device SN', { exact: true }).fill('I-1')
  await ef.getByRole('button', { name: 'Save' }).click()
  const sc = A.page.getByRole('dialog', { name: 'Start new calibration' })
  await sc.getByRole('radiogroup', { name: 'Test' }).getByRole('radio', { name: 'Both' }).click()
  await sc.getByRole('radiogroup', { name: 'Direction' }).getByRole('radio', { name: 'Up' }).click()
  await sc.getByRole('button', { name: 'Start calibration' }).click()
  await A.page.getByTestId('sheet-displacement_up').waitFor()
  await A.page.getByTestId('sheet-speed_up').waitFor()
  h.check((await A.page.getByTestId('sheet-displacement_up').locator('tbody tr').count()) === 5, 'displacement sheet does not have 5 lines')
  await fill(A, 'cell-displacement_up-1-nominal', '1'); await fill(A, 'cell-displacement_up-1-run1', '1.005'); await fill(A, 'cell-displacement_up-1-run2', '0.998')
  await expectText(A, 'cell-displacement_up-1-err1', '0.50')
  await expectText(A, 'cell-displacement_up-1-err2', '-0.20')
  await expectText(A, 'cell-displacement_up-1-diff', '0.70')
  for (const [f, v] of [['nominal', '2'], ['run1_time', '30'], ['run1_distance', '1.01'], ['run2_time', '30'], ['run2_distance', '0.99']]) await fill(A, `cell-speed_up-1-${f}`, v)
  await expectText(A, 'cell-speed_up-1-speed1', '2.02')
  await expectText(A, 'cell-speed_up-1-err1', '1.00')
  await expectText(A, 'cell-speed_up-1-speed2', '1.98')
  await expectText(A, 'cell-speed_up-1-diff', '2.00')
  h.log('crosshead sheets: displacement and speed (from time and distance) calculate % error and run difference')

  await h.nav(B, 'Visits')
  const t1 = Date.now()
  await B.page.getByText('Acme Labs').first().waitFor({ timeout: 30000 })
  h.log(`B received A's new visit in ${((Date.now() - t1) / 1000).toFixed(1)}s`)

  // --- A goes offline: load cell on that frame, tension + compression, complete
  h.setNetwork(false); await h.browserOffline(A, true)
  await A.page.getByTestId('sync-indicator').filter({ hasText: 'Offline' }).first().waitFor({ timeout: 30000 })
  await A.page.getByRole('link', { name: 'Visit', exact: true }).click()
  await A.page.getByRole('button', { name: 'Start new calibration' }).first().click()
  await A.page.getByRole('dialog', { name: 'Start new calibration' }).getByRole('button', { name: 'Add new' }).click()
  const lf = A.page.getByRole('dialog', { name: 'Add equipment' })
  await lf.getByLabel('Equipment type *').selectOption('load_cell')
  await lf.getByLabel('Device model', { exact: true }).fill('2580-50kN')
  await lf.getByLabel('Device SN', { exact: true }).fill('LC-1')
  await lf.getByLabel('Capacity', { exact: true }).fill('50')
  await lf.getByLabel('Units').selectOption('kN') // (a dropdown's name includes its current choice, so not exact)
  await lf.getByLabel('Test frame').selectOption({ label: '5967 · SN M-1' })
  await lf.getByRole('button', { name: 'Save' }).click()
  const sl = A.page.getByRole('dialog', { name: 'Start new calibration' })
  await sl.getByRole('radiogroup', { name: 'Direction' }).getByRole('radio', { name: 'Both' }).click()
  await sl.getByRole('button', { name: 'Start calibration' }).click()
  await A.page.getByTestId('sheet-tension').waitFor(); await A.page.getByTestId('sheet-compression').waitFor()
  h.check((await A.page.getByTestId('sheet-tension').locator('tbody tr').count()) === 20, 'load cell sheet does not have 20 lines')
  await fill(A, 'cell-tension-1-nominal', '10'); await fill(A, 'cell-tension-1-run1', '10.05'); await fill(A, 'cell-tension-1-run2', '9.99')
  await fill(A, 'cell-compression-1-nominal', '10'); await fill(A, 'cell-compression-1-run1', '10.2'); await fill(A, 'cell-compression-1-run2', '10.1')
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.getByText('Completed', { exact: true }).first().waitFor()
  h.check(await A.page.getByText('Fail', { exact: true }).first().isVisible(), 'a 2% compression reading did not fail at ±1%')
  h.log('A offline: added a load cell on the crosshead, tension + compression, completed (fails: 2% > ±1%)')

  // fix the city typo offline
  await h.nav(A, 'Customers'); await A.page.getByText('Acme Labs').first().click()
  await A.page.getByRole('button', { name: 'Edit' }).click()
  await A.page.getByRole('dialog').getByLabel('City').fill('Springfield')
  await A.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await h.nav(A, 'Settings')
  await A.page.getByTestId('pending-count').filter({ hasText: /^[1-9]\d*$/ }).waitFor({ timeout: 5000 })
  h.log('A offline: pending uploads =', await A.page.getByTestId('pending-count').innerText())

  await h.nav(B, 'Customers'); await B.page.getByText('Acme Labs').first().click()
  await B.page.waitForTimeout(2000)
  h.check(await B.page.getByText('Springfeild').first().isVisible(), 'B saw an offline change before A reconnected')

  // --- A reconnects
  h.setNetwork(true); await h.browserOffline(A, false)
  const t2 = Date.now()
  await B.page.getByText('Springfield').first().waitFor({ timeout: 60000 })
  h.log(`A reconnected -> B got the offline work in ${((Date.now() - t2) / 1000).toFixed(1)}s`)
  await A.page.getByTestId('pending-count').filter({ hasText: /^0$/ }).waitFor({ timeout: 60000 })
  h.check(!(await A.page.getByText('Changes the server rejected').isVisible()), 'some offline changes were rejected')

  // --- B corrects a reading; A (same calibration open) sees it live
  await h.nav(B, 'Calibrations'); await B.page.getByText('SN LC-1').first().click()
  await h.nav(A, 'Calibrations'); await A.page.getByText('SN LC-1').first().click()
  await A.page.getByTestId('sheet-compression').waitFor()
  await B.page.getByRole('button', { name: 'Reopen to edit' }).click()
  await fill(B, 'cell-compression-1-run1', '10.02')
  const t3 = Date.now()
  await A.page.locator('[data-testid="cell-compression-1-run1"][value="10.02"]').waitFor({ timeout: 30000 })
  h.log(`A saw B's correction live in ${((Date.now() - t3) / 1000).toFixed(1)}s`)

  // --- A restarts with no network and still has everything
  await A.app.close()
  h.setNetwork(false)
  const A2 = await h.launch('A', { viaRelay: true }); await h.browserOffline(A2, true); await A2.page.reload()
  await A2.page.getByText('Welcome back').waitFor({ timeout: 30000 })
  await h.nav(A2, 'Visits'); await A2.page.getByText('Acme Labs').first().waitFor({ timeout: 15000 })
  h.log('A restarted fully offline with its data')
  h.setNetwork(true)
  await A2.app.close(); await B.app.close()
})
