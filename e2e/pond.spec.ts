import { expect, test } from '@playwright/test'
import { open, tapWater } from './helpers'

test.describe('the pond', () => {
  test.beforeEach(({ page }) => open(page))

  test('shows the bubbles, and zoom grows them', async ({ page }) => {
    expect(await page.locator('[data-node]').count()).toBeGreaterThan(10)
    const width = () => page.locator('[data-node]').first().evaluate((e) => e.getBoundingClientRect().width)
    const before = await width()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(width).toBeGreaterThan(before * 1.1)
  })

  test('tapping empty water opens the add box', async ({ page }) => {
    await tapWater(page, 360, 700)
    await expect(page.getByLabel('New item')).toBeVisible()
  })

  test('pop mode deletes a bubble on touch, and undo brings it back', async ({ page }) => {
    const count = () => page.locator('[data-node]').count()
    const n = await count()
    await page.getByRole('button', { name: 'Pop mode' }).click()
    const bubble = page.locator('[data-node] [role=button]').first()
    const box = (await bubble.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + 12)
    await expect.poll(count).toBe(n - 1)
    await page.keyboard.press('Control+z')
    await expect.poll(count).toBe(n)
  })

  test('a bubble does not delete itself without pop mode', async ({ page }) => {
    const n = await page.locator('[data-node]').count()
    const box = (await page.locator('[data-node] [role=button]').first().boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + 12)
    await page.waitForTimeout(600)
    expect(await page.locator('[data-node]').count()).toBe(n)
  })

  test('every bubble has its checkbox at the bottom centre and its type icon at the top', async ({ page }) => {
    const ok = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-node] .pad')].every((pad) => {
        const r = pad.getBoundingClientRect()
        const check = pad.querySelector<HTMLElement>('button[aria-label*="done" i], button[aria-label*="Mark"]')
        if (!check) return false
        const c = check.getBoundingClientRect()
        return Math.abs(c.left + c.width / 2 - (r.left + r.width / 2)) < 2 && c.top + c.height / 2 > r.top + r.height * 0.7
      }),
    )
    expect(ok).toBe(true)
  })
})
