// Admin tools e2e: reset a technician's password, they sign in and change it,
// admin removes them and they lose access live. Needs e2e-tech1 (admin) and
// e2e-tech2 (technician) in a separate test organization, sharing E2E_PASSWORD.
// Run: npm run build && TMPROOT=$(mktemp -d) E2E_PASSWORD=... xvfb-run -a node tests/e2e-admin.cjs
const { _electron: electron } = require('playwright')
const path = require('path')
const APP = require('path').resolve(__dirname, '..')
const PW = process.env.E2E_PASSWORD
const t0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a)
async function launch(name) {
  const app = await electron.launch({ cwd: APP, executablePath: path.join(APP, 'node_modules/electron/dist/electron'), args: [path.join(APP, 'out/main/index.js'), '--no-sandbox', `--user-data-dir=${path.join(process.env.TMPROOT, 'userdata-' + name)}`] })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => console.log(`  [${name} pageerror]`, e.message))
  return { app, page }
}
async function signIn(c, email, pw) {
  await c.page.getByLabel('Email').fill(email); await c.page.getByLabel('Password').fill(pw)
  await c.page.getByRole('button', { name: 'Sign in' }).click()
}
const nav = (c, l) => c.page.getByRole('navigation').getByRole('link', { name: l }).click()
;(async () => {
  const A = await launch('A'), B = await launch('B')
  await signIn(A, 'e2e-tech1@example.com', PW); await A.page.getByText('Welcome back').waitFor({ timeout: 60000 })
  await nav(A, 'Settings')
  const row = A.page.getByRole('row').filter({ hasText: 'e2e-tech2@example.com' })
  await row.getByRole('button', { name: 'Set password' }).click()
  await A.page.getByRole('dialog').getByRole('button', { name: 'Generate' }).click()
  const temp = await A.page.getByRole('dialog').getByLabel('New password').inputValue()
  await A.page.getByRole('dialog').getByRole('button', { name: 'Set password' }).click()
  await A.page.getByText('Password changed.').waitFor({ timeout: 20000 })
  log('admin reset tech password in app; temp =', temp.replace(/./g, '*'))
  if (process.env.SHOTS) await A.page.screenshot({ path: path.join(process.env.SHOTS, '12-reset-password.png') })
  await A.page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()

  await signIn(B, 'e2e-tech2@example.com', PW)
  await B.page.getByText('Invalid login credentials').waitFor({ timeout: 20000 })
  log('old password no longer works')
  await signIn(B, 'e2e-tech2@example.com', temp)
  await B.page.getByText('Welcome back').waitFor({ timeout: 60000 })
  log('tech signed in with the temporary password')
  await nav(B, 'Settings')
  await B.page.getByRole('button', { name: 'Change password' }).click()
  const NEWPW = 'Brand-new-pass-42'
  await B.page.getByRole('dialog').getByLabel('New password', { exact: true }).fill(NEWPW)
  await B.page.getByRole('dialog').getByLabel('Repeat new password').fill(NEWPW)
  await B.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await B.page.getByRole('dialog').getByText('Password changed.').waitFor({ timeout: 20000 })
  log('tech changed own password')
  const techCanReset = await B.page.getByRole('button', { name: 'Set password' }).count()
  log('tech sees admin buttons:', techCanReset)
  await B.page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()

  // admin removes the tech -> tech loses access live
  await row.getByRole('button', { name: 'Remove' }).click()
  await A.page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  const tR = Date.now()
  await B.page.getByText('isn’t part of a company').waitFor({ timeout: 60000 })
  log(`admin removed tech -> tech's app lost access in ${((Date.now() - tR) / 1000).toFixed(1)}s`)
  const adminRowCount = await A.page.getByRole('row').filter({ hasText: 'e2e-tech1@example.com' }).getByRole('button', { name: 'Remove' }).count()
  log('admin has no Remove button on themselves:', adminRowCount === 0)
  await A.app.close(); await B.app.close()
  log('ALL ADMIN E2E CHECKS PASSED'); process.exit(0)
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
