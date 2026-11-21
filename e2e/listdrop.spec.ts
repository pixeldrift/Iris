import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test.use({ viewport: { width: 1300, height: 900 } })

test('a row let go in the slot it came from stays put: no flying off, and the sort is left alone', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  const rows = page.locator('[data-card-id]')
  await rows.nth(3).waitFor()
  const before = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId))
  const sortBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.settings.sortKey)
  const b = (await rows.nth(2).boundingBox())!
  await page.mouse.move(b.x + 120, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 120, b.y + b.height / 2 + 8, { steps: 3 })
  await page.mouse.move(b.x + 124, b.y + b.height / 2 + 2, { steps: 3 })
  await page.mouse.up()
  // while it settles, nothing carried is ever far from the list
  let worst = 0
  for (let i = 0; i < 20; i++) {
    worst = Math.max(worst, await page.evaluate(() => Math.max(0, ...[...document.body.children].filter((e) => (e as HTMLElement).style.position === 'fixed').map((e) => e.getBoundingClientRect().top))))
    await page.waitForTimeout(40)
  }
  expect(worst).toBeLessThan(900)
  expect(await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cardId))).toEqual(before)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.settings.sortKey)).toBe(sortBefore)
})
