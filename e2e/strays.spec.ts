import { expect, test } from '@playwright/test'
import { goto, open, saved } from './helpers'

test('pop mode scatters spare bubbles that pop without deleting anything', async ({ page }) => {
  await open(page)
  await goto(page, 'Pond')
  const strays = page.locator('[data-stray] button')
  await expect(strays).toHaveCount(0)
  const before = (await saved(page))!.tasks.length
  await page.getByRole('button', { name: 'Pop mode' }).click()
  await expect.poll(() => strays.count()).toBeGreaterThanOrEqual(8)
  await expect(strays.first()).toHaveText('Pop me!')
  // plain: sans-serif, and none of a real bubble's furniture
  expect(await strays.first().evaluate((e) => getComputedStyle(e).fontFamily)).not.toMatch(/display|serif.*italic/i)
  const n = await strays.count()
  await page.screenshot({ path: 'test-results/strays.png' })
  await strays.first().dispatchEvent('pointerdown', { button: 0 })
  await expect.poll(() => strays.count()).toBe(n - 1)
  expect((await saved(page))!.tasks.length).toBe(before)
  await page.getByRole('button', { name: 'Pop mode' }).click()
  await expect(strays).toHaveCount(0)
})
