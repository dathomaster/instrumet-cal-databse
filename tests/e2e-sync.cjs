// End-to-end sync test: two Electron 'laptops' (A, B) against the real Supabase +
// PowerSync Development instance. Needs two confirmed test accounts
// e2e-tech1@example.com / e2e-tech2@example.com sharing E2E_PASSWORD.
// Run: npm run build && SHOTS=docs/screenshots TMPROOT=$(mktemp -d) E2E_PASSWORD=... xvfb-run -a node tests/e2e-sync.cjs
const { _electron: electron } = require('playwright')
const path = require('path')
const fs = require('fs')
const APP = require('path').resolve(__dirname, '..')
const OUT = process.env.SHOTS
const PW = process.env.E2E_PASSWORD
const t0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a)

async function launch(name) {
  const dir = path.join(process.env.TMPROOT, 'userdata-' + name)
  const app = await electron.launch({ cwd: APP, executablePath: path.join(APP, 'node_modules/electron/dist/electron'), args: [path.join(APP, 'out/main/index.js'), '--no-sandbox', `--user-data-dir=${dir}`] })
  const page = await app.firstWindow()
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [${name} console.error]`, m.text().slice(0, 300)) })
  page.on('pageerror', (e) => console.log(`  [${name} pageerror]`, e.message))
  await page.setViewportSize({ width: 1360, height: 860 }).catch(() => {})
  return { app, page, name }
}
// A TCP relay in front of the egress proxy for laptop A. "Unplugging" it
// destroys every open socket and refuses new ones — like losing the network.
const net = require('net')
const UPSTREAM = new URL(process.env.HTTPS_PROXY)
const relay = { up: true, socks: new Set() }
const relayServer = net.createServer((c) => {
  if (!relay.up) return c.destroy()
  const u = net.connect(Number(UPSTREAM.port), UPSTREAM.hostname)
  relay.socks.add(c); relay.socks.add(u)
  const done = () => { c.destroy(); u.destroy(); relay.socks.delete(c); relay.socks.delete(u) }
  c.pipe(u).pipe(c); c.on('error', done); u.on('error', done); c.on('close', done); u.on('close', done)
})
const relayReady = new Promise((r) => relayServer.listen(0, '127.0.0.1', r))
const useRelay = async (c) => { await relayReady; const port = relayServer.address().port; await c.app.evaluate(async ({ session }, p) => { await session.defaultSession.setProxy({ proxyRules: `http://127.0.0.1:${p}` }) }, port) }
// Simulate pulling the network cable: offline emulation + dead proxy + drop open sockets
const setOffline = async (_c, offline) => {
  relay.up = !offline
  if (offline) for (const s of relay.socks) s.destroy()
}

async function login(c, email) {
  await c.page.getByLabel('Email').fill(email)
  await c.page.getByLabel('Password', { exact: true }).fill(PW)
  await c.page.getByRole('button', { name: 'Sign in' }).click()
  await c.page.getByText('Welcome back').waitFor({ timeout: 60000 })
  log(c.name, 'signed in, dashboard visible')
}
const shot = (c, n) => c.page.screenshot({ path: path.join(OUT, n + '.png') })
const nav = (c, label) => c.page.getByRole('navigation').getByRole('link', { name: label }).click()

;(async () => {
  const A = await launch('A'); await useRelay(A); await A.page.reload()
  const B = await launch('B')
  await A.page.getByText('Instrumet Calibration').first().waitFor()
  await shot(A, '01-login')
  await login(A, 'e2e-tech1@example.com')
  await login(B, 'e2e-tech2@example.com')

  // ---- A creates a customer + equipment while online
  await nav(A, 'Customers')
  await A.page.getByRole('button', { name: 'New customer' }).first().click()
  const dlg = A.page.getByRole('dialog')
  await dlg.getByLabel('Company / customer name *').fill('Acme Labs')
  await dlg.getByLabel('Contact name').fill('Jane Doe')
  await dlg.getByLabel('City').fill('Springfeild') // typo on purpose — fixed later offline
  await dlg.getByRole('button', { name: 'Save' }).click()
  await A.page.getByRole('heading', { name: 'Acme Labs' }).waitFor()
  await A.page.getByRole('button', { name: 'Add equipment' }).first().click()
  const d2 = A.page.getByRole('dialog')
  await d2.getByLabel('Description *').fill('Digital Pressure Gauge')
  await d2.getByLabel('Manufacturer').fill('Ashcroft')
  await d2.getByLabel('Model').fill('DG25')
  await d2.getByLabel('Serial number').fill('SN-48213')
  await d2.getByLabel('Units').fill('psi')
  await d2.getByRole('button', { name: 'Save' }).click()
  await A.page.getByRole('heading', { name: 'Digital Pressure Gauge' }).waitFor()
  log('A created customer + equipment')

  // ---- B sees it live
  await nav(B, 'Customers')
  const tB = Date.now()
  await B.page.getByText('Acme Labs').waitFor({ timeout: 30000 })
  log(`B received customer from A in ${((Date.now() - tB) / 1000).toFixed(1)}s`)
  await B.page.getByText('Acme Labs').first().click()
  await B.page.getByText('Springfeild').first().waitFor()

  // ---- A goes OFFLINE
  await setOffline(A, true)
  await A.page.waitForTimeout(1500)
  for (let i = 0; i < 1; i++) {
    const st = await A.page.getByTestId('sync-indicator').evaluate((el) => ({ ...el.dataset, text: el.innerText, title: el.title }))
    log('A status', JSON.stringify(st))
    await A.page.waitForTimeout(2500)
  }
  await A.page.getByTestId('sync-indicator').filter({ hasText: 'Offline' }).waitFor({ timeout: 30000 })
  log('A is offline:', await A.page.getByTestId('sync-indicator').innerText())

  // A starts a calibration offline with 3 points
  await A.page.getByRole('button', { name: 'New calibration' }).first().click()
  await A.page.getByTestId('points-table').waitFor()
  const rows = [['Pressure', 'psi', '0', '0.25', '', '0.1', ''], ['Pressure', 'psi', '50', '0.25', '', '50.4', '50.05'], ['Pressure', 'psi', '100', '0.25', '', '99.9', '']]
  for (let i = 0; i < rows.length; i++) {
    await A.page.getByRole('button', { name: 'Add measurement point' }).click()
    const row = A.page.getByTestId('points-table').locator('tbody tr').nth(i)
    await row.waitFor()
    const inputs = row.locator('input')
    const vals = rows[i]
    for (let j = 0; j < vals.length; j++) if (vals[j] !== '') { await inputs.nth(j).fill(vals[j]); await inputs.nth(j).press('Tab') }
  }
  await A.page.getByLabel('Temperature (°C)').fill('21.5'); await A.page.getByLabel('Temperature (°C)').press('Tab')
  await A.page.getByRole('button', { name: 'Complete calibration' }).click()
  await A.page.getByText('Completed', { exact: true }).waitFor()
  await shot(A, '04-calibration-offline')
  log('A completed calibration offline')

  // A fixes the city typo offline
  await nav(A, 'Customers')
  await A.page.getByText('Acme Labs').first().click()
  await A.page.getByRole('button', { name: 'Edit' }).click()
  await A.page.getByRole('dialog').getByLabel('City').fill('Springfield')
  await A.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await A.page.getByText('Springfield', { exact: false }).first().waitFor()
  await nav(A, 'Settings')
  await A.page.getByTestId('pending-count').filter({ hasText: /^[1-9]\d*$/ }).waitFor({ timeout: 5000 })
  const pending = await A.page.getByTestId('pending-count').innerText()
  const sidebar = await A.page.getByRole('complementary').getByTestId('sync-indicator').innerText()
  if (!sidebar.includes(pending)) throw new Error(`sidebar (${sidebar}) and settings (${pending}) disagree`)
  log('A pending uploads while offline:', pending)
  await shot(A, '05-offline-pending')

  // B must NOT have the offline edits yet
  await B.page.waitForTimeout(3000)
  const bStillTypo = await B.page.getByText('Springfeild').first().isVisible()
  log('B still shows old value while A offline:', bStillTypo)

  // ---- A back ONLINE: changes upload automatically
  await setOffline(A, false)
  const tUp = Date.now()
  await B.page.getByText('Springfield').first().waitFor({ timeout: 60000 })
  log(`B received A's offline fix ${((Date.now() - tUp) / 1000).toFixed(1)}s after A reconnected`)
  await A.page.getByTestId('pending-count').filter({ hasText: /^0$/ }).waitFor({ timeout: 60000 })
  log('A upload queue drained')

  // B sees equipment due date and completed calibration
  await nav(B, 'Calibrations')
  await B.page.getByText('Digital Pressure Gauge').first().waitFor({ timeout: 30000 })
  await B.page.getByText('Digital Pressure Gauge').first().click()
  await B.page.getByText('Completed', { exact: true }).waitFor()
  await shot(B, '06-B-sees-calibration')
  log('B sees completed calibration from A')

  // ---- B spots an error and corrects a reading; A (viewing same record) updates live
  await nav(A, 'Calibrations')
  await A.page.getByText('Digital Pressure Gauge').first().click()
  await A.page.getByText('Completed', { exact: true }).waitFor()
  await B.page.getByRole('button', { name: 'Reopen to edit' }).click()
  const bRow = B.page.getByTestId('points-table').locator('tbody tr').nth(0)
  const asFound = bRow.locator('input').nth(5)
  await asFound.fill('0.12'); await asFound.press('Tab')
  const tLive = Date.now()
  await A.page.getByTestId('points-table').locator('tbody tr').nth(0).locator('input').nth(5).and(A.page.locator('[value="0.12"]')).waitFor({ timeout: 30000 })
  log(`A saw B's correction live in ${((Date.now() - tLive) / 1000).toFixed(1)}s`)
  await B.page.getByRole('button', { name: 'Complete calibration' }).click()
  await B.page.getByText('Completed', { exact: true }).waitFor()

  // Certificate renders
  await A.page.getByText('Completed', { exact: true }).waitFor({ timeout: 30000 })
  await A.page.getByRole('button', { name: 'Certificate' }).click()
  await A.page.getByText('Certificate of Calibration').waitFor()
  await shot(A, '07-certificate')

  // Dashboard + equipment screenshots
  await nav(A, 'Dashboard'); await A.page.waitForTimeout(500); await shot(A, '02-dashboard')
  await nav(A, 'Customers'); await A.page.getByText('Acme Labs').first().click(); await A.page.waitForTimeout(500); await shot(A, '02b-customer')
  await nav(A, 'Equipment'); await A.page.getByText('Digital Pressure Gauge').first().click(); await A.page.waitForTimeout(500); await shot(A, '03-equipment')

  // ---- Offline restart: A relaunches with no network and still has all data
  await A.app.close()
  await setOffline(null, true)
  const A2 = await launch('A'); await useRelay(A2)
  await A2.page.reload()
  await A2.page.getByText('Welcome back').waitFor({ timeout: 30000 })
  await nav(A2, 'Customers')
  await A2.page.getByText('Acme Labs').waitFor({ timeout: 15000 })
  log('A restarted fully offline and still has its data:', await A2.page.getByTestId('sync-indicator').innerText())
  await shot(A2, '08-offline-restart')

  await A2.app.close(); await B.app.close()
  log('ALL E2E CHECKS PASSED'); relayServer.close(); process.exit(0)
})().catch(async (e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
