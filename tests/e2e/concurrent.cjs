// Two technicians on the same sheet cell (seeded by scripts/e2e.mjs).
const h = require('./helpers.cjs')
const CAL = '#/calibrations/ca000000-0000-0000-0000-0000000000e2'
const cell = (c) => c.page.getByTestId('cell-tension-1-run1')
const shows = (c, v) => c.page.locator(`[data-testid="cell-tension-1-run1"][value="${v}"]`).waitFor({ timeout: 20000 })

h.run('CONCURRENT', async () => {
  const A = await h.launch('A'), B = await h.launch('B')
  for (const [c, e] of [[A, h.TECH1], [B, h.TECH2]]) { await h.signIn(c, e); await h.goto(c, CAL); await c.page.getByTestId('sheet-tension').waitFor() }
  await shows(A, '10.0')

  // A focuses the cell; B changes it; A leaves without typing -> B's edit survives
  await cell(A).focus()
  await cell(B).fill('11.0'); await cell(B).press('Tab')
  await A.page.waitForTimeout(3000)
  h.check((await cell(A).inputValue()) === '10.0', "A's cell changed under the cursor while focused")
  await cell(A).blur()
  await shows(A, '11.0')
  await B.page.waitForTimeout(2000)
  h.check((await cell(B).inputValue()) === '11.0', "B's edit was overwritten by A's untouched cell")
  h.log("leaving a cell untouched did not overwrite the colleague's edit")

  // A really edits -> last write wins everywhere
  await cell(A).fill('12.0'); await cell(A).press('Tab')
  await shows(B, '12.0')
  h.log('real edit by A reached B (last write wins)')
  await A.app.close(); await B.app.close()
})
