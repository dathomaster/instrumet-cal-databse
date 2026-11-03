// Auth/offline e2e test: admin approval, sign out + sign in while offline,
// restart offline, automatic resume of syncing. Needs e2e-tech1 (admin) and
// e2e-tech2 (pending) in a separate test organization, sharing E2E_PASSWORD.
// Run: npm run build && TMPROOT=$(mktemp -d) E2E_PASSWORD=... xvfb-run -a node tests/e2e-auth.cjs
const { _electron: electron } = require('playwright')
const path = require('path')
const net = require('net')
const APP = require('path').resolve(__dirname, '..')
const PW = process.env.E2E_PASSWORD
const t0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a)
const OUT = process.env.SHOTS

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
const setOffline = (off) => { relay.up = !off; if (off) for (const s of relay.socks) s.destroy() }

async function launch(name, { viaRelay = false, offlineEvent } = {}) {
  const app = await electron.launch({ cwd: APP, executablePath: path.join(APP, 'node_modules/electron/dist/electron'), args: [path.join(APP, 'out/main/index.js'), '--no-sandbox', `--user-data-dir=${path.join(process.env.TMPROOT, 'userdata-' + name)}`] })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log(`  [${name} pageerror]`, e.message))
  if (viaRelay) { await relayReady; const port = relayServer.address().port; await app.evaluate(async ({ session }, p) => session.defaultSession.setProxy({ proxyRules: `http://127.0.0.1:${p}` }), port); await page.reload() }
  return { app, page, name }
}
// navigator.onLine can't be faked through the proxy, so also flip Chromium's offline flag for the renderer
const browserOffline = (c, off) => c.app.evaluate(({ session }, o) => o ? session.defaultSession.enableNetworkEmulation({ offline: true }) : session.defaultSession.disableNetworkEmulation(), off)
const nav = (c, label) => c.page.getByRole('navigation').getByRole('link', { name: label }).click()
const shot = (c, n) => OUT && c.page.screenshot({ path: path.join(OUT, n + '.png') })
async function signIn(c, email, pw = PW) {
  await c.page.getByLabel('Email').fill(email)
  await c.page.getByLabel('Password').fill(pw)
  await c.page.getByRole('button', { name: 'Sign in' }).click()
}

;(async () => {
  // ---------- 1. Approval flow
  const A = await launch('A', { viaRelay: true })
  const B = await launch('B')
  await signIn(A, 'e2e-tech1@example.com'); await A.page.getByText('Welcome back').waitFor({ timeout: 60000 })
  await signIn(B, 'e2e-tech2@example.com'); await B.page.getByText('Waiting for approval').waitFor({ timeout: 60000 })
  log('B (new sign-up) sees "Waiting for approval" and no data')
  await shot(B, '09-waiting-for-approval')
  await nav(A, 'Settings')
  await A.page.getByText('1 waiting for approval').waitFor({ timeout: 30000 })
  await shot(A, '10-approve')
  await A.page.getByRole('button', { name: 'Approve' }).click()
  const tAp = Date.now()
  await B.page.getByText('Welcome back').waitFor({ timeout: 60000 })
  log(`admin approved -> B unlocked automatically in ${((Date.now() - tAp) / 1000).toFixed(1)}s`)

  // ---------- 2. Offline: sign out and back in without internet
  await nav(A, 'Customers')
  setOffline(true); await browserOffline(A, true)
  await A.page.getByTestId('sync-indicator').filter({ hasText: 'Offline' }).waitFor({ timeout: 30000 })
  await A.page.getByRole('button', { name: 'New customer' }).first().click()
  await A.page.getByRole('dialog').getByLabel('Company / customer name *').fill('Offline Customer Co')
  await A.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await A.page.getByRole('heading', { name: 'Offline Customer Co' }).waitFor()
  log('A (offline) created a customer')
  await nav(A, 'Settings')
  await A.page.getByRole('button', { name: 'Sign out' }).first().click()
  await A.page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click()
  await A.page.getByRole('button', { name: 'Sign in' }).waitFor()
  const prefilled = await A.page.getByLabel('Email').inputValue()
  log('A signed out while offline; login screen email prefilled:', prefilled)
  await shot(A, '11-offline-login')

  await signIn(A, 'e2e-tech1@example.com', 'wrong-password')
  await A.page.getByText('Incorrect password.').waitFor()
  log('offline wrong password rejected')
  await signIn(A, 'e2e-tech2@example.com')
  await A.page.getByText('only e2e-tech1@example.com can sign in').waitFor()
  log('offline sign-in as a different person refused (data protected)')
  await signIn(A, 'e2e-tech1@example.com')
  await A.page.getByText('Welcome back').waitFor({ timeout: 15000 })
  await nav(A, 'Customers'); await A.page.getByText('Offline Customer Co').waitFor()
  log('A signed back in OFFLINE and still has its unsynced customer')

  // restart the app while still offline, signed out -> sign in offline again
  await nav(A, 'Settings')
  await A.page.getByRole('button', { name: 'Sign out' }).first().click()
  await A.page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click()
  await A.app.close()
  const A2 = await launch('A', { viaRelay: true })
  await browserOffline(A2, true)
  await A2.page.reload()
  await signIn(A2, 'e2e-tech1@example.com')
  await A2.page.getByText('Welcome back').waitFor({ timeout: 15000 })
  log('after a restart, signed in fully offline again')

  // ---------- 3. Back online: syncing resumes by itself
  A2.page.on('console', (m) => { const t = m.text(); if (/auth|session|PowerSync|credential/i.test(t)) console.log('  [A2 console]', m.type(), t.slice(0, 200)) })
  setOffline(false); await browserOffline(A2, false)
  await nav(A2, 'Settings'); await A2.page.waitForTimeout(1000)
  await A2.page.waitForTimeout(15000); const rejected = await A2.page.getByText('Changes the server rejected').isVisible()
  if (rejected) throw new Error('offline change was rejected instead of uploaded')
  log('no changes were rejected after reconnecting')
  await nav(B, 'Customers')
  const tUp = Date.now()
  await B.page.getByText('Offline Customer Co').waitFor({ timeout: 20000 })
  log(`back online -> A auto-signed-in to the server and B received the offline customer in ${((Date.now() - tUp) / 1000).toFixed(1)}s`)

  await A2.app.close(); await B.app.close()
  log('ALL AUTH E2E CHECKS PASSED'); relayServer.close(); process.exit(0)
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
