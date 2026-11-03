// Two technicians on the same measurement point (seeded by scripts/e2e.mjs).
const h = require('./helpers.cjs')
const CAL = '#/calibrations/ca000000-0000-0000-0000-0000000000e2'
const asFound = (c) => c.page.getByTestId('points-table').locator('tbody tr').nth(0).locator('input').nth(5)

h.run('CONCURRENT', async () => {
  const A = await h.launch('A'), B = await h.launch('B')
  for (const [c, e] of [[A, h.TECH1], [B, h.TECH2]]) { await h.signIn(c, e); await h.goto(c, CAL); await c.page.getByTestId('points-table').waitFor() }
  await A.page.getByTestId('points-table').locator('tbody tr input[value="1.0"]').first().waitFor({ timeout: 30000 })

  // A focuses the field; B changes it; A leaves without typing -> B's edit survives
  await asFound(A).focus()
  await asFound(B).fill('2.0'); await asFound(B).press('Tab')
  await A.page.waitForTimeout(3000)
  h.check((await asFound(A).inputValue()) === '1.0', "A's field changed under the cursor while focused")
  await asFound(A).blur()
  await A.page.getByTestId('points-table').locator('tbody tr input[value="2.0"]').first().waitFor({ timeout: 15000 })
  await B.page.waitForTimeout(2000)
  h.check((await asFound(B).inputValue()) === '2.0', "B's edit was overwritten by A's untouched field")
  h.log("leaving a field untouched did not overwrite the colleague's edit")

  // A really edits -> last write wins everywhere
  await asFound(A).fill('3.0'); await asFound(A).press('Tab')
  await B.page.getByTestId('points-table').locator('tbody tr input[value="3.0"]').first().waitFor({ timeout: 20000 })
  h.log('real edit by A reached B (last write wins)')
  await A.app.close(); await B.app.close()
})
