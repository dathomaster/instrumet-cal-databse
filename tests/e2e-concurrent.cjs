// Concurrent-edit e2e: two technicians on the same calibration point. Focusing
// and leaving a field without typing must not overwrite the other's newer edit;
// a real edit wins (last write wins). Needs e2e-tech1/2 in a test organization
// plus the seed rows (customer/equipment/calibration/point ids ending in e2) —
// see the git history of this file. Run: npm run build && TMPROOT=$(mktemp -d) E2E_PASSWORD=... xvfb-run -a node tests/e2e-concurrent.cjs
const { _electron: electron } = require('playwright')
const path = require('path')
const APP = require('path').resolve(__dirname, '..')
const PW = process.env.E2E_PASSWORD
const t0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a)
async function launch(name) {
  const app = await electron.launch({ cwd: APP, executablePath: path.join(APP, 'node_modules/electron/dist/electron'), args: [path.join(APP, 'out/main/index.js'), '--no-sandbox', `--user-data-dir=${path.join(process.env.TMPROOT, 'userdata-' + name)}`] })
  const page = await app.firstWindow(); return { app, page }
}
async function open(c, email) {
  await c.page.getByLabel('Email').fill(email); await c.page.getByLabel('Password', { exact: true }).fill(PW)
  await c.page.getByRole('button', { name: 'Sign in' }).click(); await c.page.getByText('Welcome back').waitFor({ timeout: 60000 })
  await c.page.evaluate(() => { location.hash = '#/calibrations/ca000000-0000-0000-0000-0000000000e2' })
  await c.page.getByTestId('points-table').waitFor()
}
const asFound = (c) => c.page.getByTestId('points-table').locator('tbody tr').nth(0).locator('input').nth(5)
;(async () => {
  const A = await launch('A'), B = await launch('B')
  await open(A, 'e2e-tech1@example.com'); await open(B, 'e2e-tech2@example.com')
  log('both open the same calibration; as-found =', await asFound(A).inputValue())

  // 1. A clicks into the field, B changes it, A leaves without typing
  await asFound(A).focus()
  await asFound(B).fill('2.0'); await asFound(B).press('Tab')
  await A.page.waitForTimeout(3000)
  log('while A is still in the field it shows (unchanged, not yanked mid-edit):', await asFound(A).inputValue())
  await asFound(A).blur()
  await A.page.waitForTimeout(3000)
  const a1 = await asFound(A).inputValue(), b1 = await asFound(B).inputValue()
  log('A clicked away without typing -> A shows', a1, '| B shows', b1)
  if (a1 !== '2.0' || b1 !== '2.0') throw new Error("B's edit was overwritten by A's untouched field")

  // 2. A actually types a new value -> last write wins, everyone converges
  await asFound(A).fill('3.0'); await asFound(A).press('Tab')
  await B.page.getByTestId('points-table').locator('tbody tr').nth(0).locator('input[value="3.0"]').waitFor({ timeout: 20000 })
  log('A typed 3.0 -> B now shows', await asFound(B).inputValue())
  await A.app.close(); await B.app.close()
  log('CONCURRENT EDIT CHECKS PASSED'); process.exit(0)
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
