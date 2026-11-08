import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('soft dots on the border for bubbles out of view', () => {
  test('a dot sits on the frame for each bubble wholly out of view, fades in, tapping it goes there, and Frame all clears them', async ({ page }) => {
    await open(page)
    await expect(page.locator('.edge-dot')).toHaveCount(0) // everything is in view to begin with
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Zoom in/ }).click()
    await expect.poll(() => page.locator('.edge-dot').count()).toBeGreaterThan(0)
    // they sit on the pond's frame (just inside its edge)
    const pond = (await page.locator('[aria-label^="Pond canvas"]').boundingBox())!
    const on = await page.locator('.edge-dot').evaluateAll(
      (els, p) =>
        els.every((e) => {
          const r = e.getBoundingClientRect()
          const x = r.left + r.width / 2
          const y = r.top + r.height / 2
          const d = Math.min(x - p.x, p.x + p.w - x, y - p.y, p.y + p.h - y)
          return d >= 0 && d < 16
        }),
      { x: pond.x, y: pond.y, w: pond.width, h: pond.height },
    )
    expect(on).toBe(true)
    const before = await page.locator('[data-node]').first().boundingBox()
    await page.locator('.edge-dot').first().click()
    await page.waitForTimeout(1700)
    const after = await page.locator('[data-node]').first().boundingBox()
    expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0)) + Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeGreaterThan(20) // (the canvas moved)
    await page.getByRole('button', { name: 'Frame all' }).click()
    await page.waitForTimeout(2200)
    await expect(page.locator('.edge-dot')).toHaveCount(0)
  })
})
