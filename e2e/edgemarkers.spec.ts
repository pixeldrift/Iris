import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('pointers to off-screen bubbles', () => {
  test('glowing markers on the border point toward bubbles out of view; Frame all clears them, and tapping one goes there', async ({ page }) => {
    await open(page)
    // everything is in view to begin with
    await expect(page.locator('.edge-marker')).toHaveCount(0)
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Zoom in/ }).click()
    await expect.poll(() => page.locator('.edge-marker').count()).toBeGreaterThan(0)
    const first = page.locator('.edge-marker').first()
    await expect(first).toHaveAttribute('aria-label', /more bubbles? this way/)
    const before = await page.locator('[data-node]').first().boundingBox()
    await first.click()
    await page.waitForTimeout(1700)
    const after = await page.locator('[data-node]').first().boundingBox()
    expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0)) + Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeGreaterThan(20) // (the canvas moved)
    await page.getByRole('button', { name: 'Frame all' }).click()
    await page.waitForTimeout(1700)
    await expect(page.locator('.edge-marker')).toHaveCount(0)
  })
})
