import { expect, test } from '@playwright/test'
import { goto, open, saved } from './helpers'

test('pop mode scatters spare bubbles that pop without deleting anything', async ({ page }) => {
  await open(page)
  await goto(page, 'Pond')
  const strays = page.locator('[data-stray] button')
  await expect(strays).toHaveCount(0)
  const before = (await saved(page))!.tasks.length
  await page.getByRole('button', { name: 'Pop mode' }).click()
  await expect.poll(() => strays.count()).toBeGreaterThanOrEqual(4)
  // bubbles like the others, just with nothing written on them
  await expect(strays.first()).toHaveText('')
  await expect(strays.first()).toHaveClass(/pad/)
  const n = await strays.count()
  await page.screenshot({ path: 'test-results/strays.png' })
  await strays.first().dispatchEvent('pointerdown', { button: 0 })
  // it bursts, and a new one floats up somewhere else so there is always something to pop
  await expect.poll(async () => (await page.locator('[data-stray] button[disabled]').count()) + (n - (await strays.count()))).toBeGreaterThan(0)
  await expect(page.locator('[data-stray] button[disabled]')).toHaveCount(0, { timeout: 3000 })
  await expect.poll(() => strays.count()).toBeGreaterThanOrEqual(n - 1) // (a new one floats up if there is room for it)
  expect((await saved(page))!.tasks.length).toBe(before)
  await page.getByRole('button', { name: 'Pop mode' }).click()
  await expect(strays).toHaveCount(0)
})
