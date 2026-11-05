// Shared helpers for the Electron end-to-end tests. Run via `npm run test:e2e`
// (scripts/e2e.mjs), which creates the test company/users and cleans up.
const { _electron: electron } = require('playwright')
const path = require('path')
const net = require('net')

const APP = path.resolve(__dirname, '..', '..')
const ELECTRON = require(path.join(APP, 'node_modules', 'electron')) // path to the Electron binary
const PW = process.env.E2E_PASSWORD
const TMPROOT = process.env.TMPROOT
const SHOTS = process.env.SHOTS // optional screenshot folder
const ORG = 'eeeeeeee-0000-0000-0000-00000000e2e0'
const TECH1 = 'e2e-tech1@example.com'
const TECH2 = 'e2e-tech2@example.com'

const t0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a)

// ---- "Network cable" for a laptop: a local proxy we can unplug ------------
// Unplugging destroys every open connection and refuses new ones. Works with
// an upstream proxy (HTTPS_PROXY, e.g. in CI sandboxes) or directly.
const UPSTREAM = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null
const relay = { up: true, socks: new Set() }
const track = (...s) => s.forEach((x) => { relay.socks.add(x); x.on('close', () => relay.socks.delete(x)); x.on('error', () => x.destroy()) })
const relayServer = net.createServer((client) => {
  if (!relay.up) return client.destroy()
  if (UPSTREAM) {
    const up = net.connect(Number(UPSTREAM.port), UPSTREAM.hostname)
    track(client, up)
    client.pipe(up).pipe(client)
    return
  }
  // Minimal HTTP CONNECT proxy (all app traffic is HTTPS)
  client.once('data', (buf) => {
    const m = /^CONNECT ([^:\s]+):(\d+) HTTP/i.exec(buf.toString('latin1'))
    if (!m) return client.destroy()
    const up = net.connect(Number(m[2]), m[1], () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      client.pipe(up).pipe(client)
    })
    track(client, up)
  })
})
const relayReady = new Promise((r) => relayServer.listen(0, '127.0.0.1', r))
function setNetwork(online) {
  relay.up = online
  if (!online) for (const s of relay.socks) s.destroy()
}

// ---- App control ------------------------------------------------------------
const launched = [] // for failure screenshots
async function launch(name, { viaRelay = false } = {}) {
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [path.join(APP, 'out/main/index.js'), '--no-sandbox', `--user-data-dir=${path.join(TMPROOT, 'userdata-' + name)}`]
  })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log(`  [${name} pageerror]`, e.message))
  launched.push({ name, page })
  if (viaRelay) {
    await relayReady
    const port = relayServer.address().port
    await app.evaluate(async ({ session }, p) => session.defaultSession.setProxy({ proxyRules: `http://127.0.0.1:${p}` }), port)
    await page.reload()
  }
  return { app, page, name }
}
// navigator.onLine can't be faked through the proxy; flip Chromium's flag too
const browserOffline = (c, off) =>
  c.app.evaluate(({ session }, o) => (o ? session.defaultSession.enableNetworkEmulation({ offline: true }) : session.defaultSession.disableNetworkEmulation()), off)

async function signIn(c, email, pw = PW, { expectDashboard = true } = {}) {
  await c.page.getByLabel('Email').fill(email)
  await c.page.getByLabel('Password', { exact: true }).fill(pw)
  await c.page.getByRole('button', { name: 'Sign in' }).click()
  if (expectDashboard) await c.page.getByText('Welcome back').waitFor({ timeout: 60000 })
}
const nav = (c, label) => c.page.getByRole('navigation').getByRole('link', { name: label }).click()
const goto = (c, hash) => c.page.evaluate((h) => { location.hash = h }, hash)
const shot = (c, n) => SHOTS && c.page.screenshot({ path: path.join(SHOTS, n + '.png') })

/** Run a test body; print PASSED / FAILED and exit with the right code. */
function run(name, body) {
  body()
    .then(() => { log(`ALL ${name} CHECKS PASSED`); relayServer.close(); process.exit(0) })
    .catch(async (e) => {
      console.error(`E2E FAILED (${name}):`, e.message.split('\n')[0])
      const dir = SHOTS || TMPROOT
      for (const l of launched) {
        const file = path.join(dir, `FAIL-${name}-${l.name}.png`)
        if (await l.page.screenshot({ path: file }).then(() => true, () => false)) console.error(`  screenshot: ${file}`)
      }
      process.exit(1)
    })
}
function check(cond, msg) { if (!cond) throw new Error(msg) }

module.exports = { APP, PW, ORG, TECH1, TECH2, log, launch, setNetwork, browserOffline, signIn, nav, goto, shot, run, check }
