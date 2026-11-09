import { expect, test } from '@playwright/test'
import { goto, open, saved } from './helpers'

test('quick add in the list: Enter adds, keeps the box focused for the next, shows the new row at the top with a glow, then it slides into its sorted place', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  const box = page.getByLabel('Add a task')
  await box.click()
  const rows = page.locator('[data-lift-id^="task:"]')
  const before = await rows.count()
  await page.keyboard.type('Zebra first')
  await page.keyboard.press('Enter')
  // still in the box, which is empty again, ready for another
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('')
  await page.keyboard.type('Aardvark second')
  await page.keyboard.press('Enter')
  await expect(box).toBeFocused()
  await expect(rows).toHaveCount(before + 2)
  // both are at the top, newest first, and glowing
  const titles = () => page.locator('[data-lift-id^="task:"]').evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent ?? ''))
  const top = await titles()
  expect(top[0]).toContain('Aardvark second')
  expect(top[1]).toContain('Zebra first')
  await expect(page.locator('.just-added')).toHaveCount(2)
  await expect(page.getByRole('status').filter({ hasText: 'Added' })).toHaveText(/Added Aardvark second/)
  // a moment later the glow is gone and they have gone to where the sort puts them (not both still on top)
  await expect(page.locator('.just-added')).toHaveCount(0, { timeout: 6000 })
  await expect.poll(async () => (await titles())[0].includes('Aardvark second') && (await titles())[1].includes('Zebra first'), { timeout: 4000 }).toBe(false)
  const st = await saved(page)
  expect(st?.tasks.filter((t) => ['Zebra first', 'Aardvark second'].includes(t.title))).toHaveLength(2)
})
