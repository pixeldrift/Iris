import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test('list rows can be reached and opened from the keyboard, and the arrows move between them', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  const rows = page.locator('[data-lift-id^="task:"]')
  await expect(rows.first()).toBeVisible()
  await rows.first().focus()
  const idOf = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.liftId ?? '')
  const first = await idOf()
  expect(first).toMatch(/^task:/)
  await page.keyboard.press('ArrowDown')
  const second = await idOf()
  expect(second).not.toBe(first)
  await page.keyboard.press('ArrowUp')
  expect(await idOf()).toBe(first)
  await page.keyboard.press('End')
  expect(await idOf()).not.toBe(first)
  await page.keyboard.press('Home')
  expect(await idOf()).toBe(first)
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Task details')).toBeVisible()
})

test('board cards too', async ({ page }) => {
  await open(page)
  await goto(page, 'Progress')
  const cards = page.locator('[data-lift-id^="task:"]')
  await expect(cards.first()).toBeVisible()
  await cards.first().focus()
  await page.keyboard.press('ArrowDown')
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.liftId ?? '')).toMatch(/^task:/)
})
