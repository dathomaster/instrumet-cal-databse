// Two laptops: live sync, offline work, reconnect, live correction, offline restart.
const h = require('./helpers.cjs')

h.run('SYNC', async () => {
  const A = await h.launch('A', { viaRelay: true })
  const B = await h.launch('B')
  await h.signIn(A, h.TECH1); await h.signIn(B, h.TECH2)

  // A creates a customer + equipment online
  await h.nav(A, 'Customers')
  await A.page.getByRole('button', { name: 'New customer' }).first().click()
  const d = A.page.getByRole('dialog')
  await d.getByLabel('Company / customer name *').fill('Acme Labs')
  await d.getByLabel('City').fill('Springfeild') // typo, fixed later while offline
  await d.getByRole('button', { name: 'Save' }).click()
  await A.page.getByRole('heading', { name: 'Acme Labs' }).waitFor()
  await A.page.getByRole('button', { name: 'Add equipment' }).first().click()
  const d2 = A.page.getByRole('dialog')
  await d2.getByLabel('Description *').fill('Digital Pressure Gauge')
  await d2.getByLabel('Serial number').fill('SN-48213')
  await d2.getByRole('button', { name: 'Save' }).click()
  await A.page.getByRole('heading', { name: 'Digital Pressure Gauge' }).waitFor()

  await h.nav(B, 'Customers')
  const t1 = Date.now()
  await B.page.getByText('Acme Labs').first().waitFor({ timeout: 30000 })
  h.log(`B received A's new customer in ${((Date.now() - t1) / 1000).toFixed(1)}s`)

  // A goes offline and works
  h.setNetwork(false); await h.browserOffline(A, true)
  await A.page.getByTestId('sync-indicator').filter({ hasText: 'Offline' }).first().waitFor({ timeout: 30000 })
  await A.page.getByRole('button', { name: 'New calibration' }).first().click()
  await A.page.getByTestId('points-table').waitFor()
  const rows = [['Pressure', 'psi', '0', '0.25', '', '0.1', ''], ['Pressure', 'psi', '50', '0.25', '', '50.4', '50.05']]
  for (let i = 0; i < rows.length; i++) {
    await A.page.getByRole('button', { name: 'Add measurement point' }).click()
    const inputs = A.page.getByTestId('points-table').locator('tbody tr').nth(i).locator('input')
    for (let j = 0; j < rows[i].length; j++) if (rows[i][j]) { await inputs.nth(j).fill(rows[i][j]); await inputs.nth(j).press('Tab') }
  }
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.getByText('Completed', { exact: true }).waitFor()
  await h.nav(A, 'Customers'); await A.page.getByText('Acme Labs').first().click()
  await A.page.getByRole('button', { name: 'Edit' }).click()
  await A.page.getByRole('dialog').getByLabel('City').fill('Springfield')
  await A.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await h.nav(A, 'Settings')
  await A.page.getByTestId('pending-count').filter({ hasText: /^[1-9]\d*$/ }).waitFor({ timeout: 5000 })
  h.log('A offline: completed a calibration and fixed a typo; pending uploads =', await A.page.getByTestId('pending-count').innerText())

  await h.nav(B, 'Customers'); await B.page.getByText('Acme Labs').first().click()
  await B.page.waitForTimeout(2000)
  h.check(await B.page.getByText('Springfeild').first().isVisible(), 'B saw an offline change before A reconnected')

  // A reconnects
  h.setNetwork(true); await h.browserOffline(A, false)
  const t2 = Date.now()
  await B.page.getByText('Springfield').first().waitFor({ timeout: 60000 })
  h.log(`A reconnected -> B got the offline fix in ${((Date.now() - t2) / 1000).toFixed(1)}s`)
  await A.page.getByTestId('pending-count').filter({ hasText: /^0$/ }).waitFor({ timeout: 60000 })
  h.check(!(await A.page.getByText('Changes the server rejected').isVisible()), 'some offline changes were rejected')

  // B corrects a reading on the completed calibration; A sees it live
  await h.nav(B, 'Calibrations'); await B.page.getByText('Digital Pressure Gauge').first().click()
  await h.nav(A, 'Calibrations'); await A.page.getByText('Digital Pressure Gauge').first().click()
  await B.page.getByRole('button', { name: 'Reopen to edit' }).click()
  const cell = B.page.getByTestId('points-table').locator('tbody tr').nth(0).locator('input').nth(5)
  await cell.fill('0.12'); await cell.press('Tab')
  const t3 = Date.now()
  await A.page.getByTestId('points-table').locator('tbody tr').nth(0).locator('input[value="0.12"]').waitFor({ timeout: 30000 })
  h.log(`A saw B's correction live in ${((Date.now() - t3) / 1000).toFixed(1)}s`)

  // A restarts with no network and still has everything
  await A.app.close()
  h.setNetwork(false)
  const A2 = await h.launch('A', { viaRelay: true }); await h.browserOffline(A2, true); await A2.page.reload()
  await A2.page.getByText('Welcome back').waitFor({ timeout: 30000 })
  await h.nav(A2, 'Customers'); await A2.page.getByText('Acme Labs').waitFor({ timeout: 15000 })
  h.log('A restarted fully offline with its data')
  h.setNetwork(true)
  await A2.app.close(); await B.app.close()
})
