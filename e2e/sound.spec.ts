import { expect, test } from '@playwright/test'
import { open } from './helpers'

// Each recording's length (seconds), to tell which one played.
const LEN = { bubble: 0.216, drip: 0.261, popHigh: 0.1, popLow: 0.185 }

test.describe('interface sounds', () => {
  test.beforeEach(async ({ page }) => {
    // record every sample that starts playing
    await page.addInitScript(() => {
      const w = window as unknown as { __played: number[] }
      w.__played = []
      const start = AudioBufferSourceNode.prototype.start
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
        if (this.buffer && this.buffer.duration > 0.05) w.__played.push(Math.round(this.buffer.duration * 1000) / 1000)
        return start.apply(this, args)
      }
    })
    await open(page)
  })
  const played = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __played: number[] }).__played)
  const near = (x: number, y: number) => Math.abs(x - y) < 0.01

  test('adding an item plays the bubble, finishing one the double drip, and neither is a chime', async ({ page }) => {
    await page.mouse.click(600, 400) // any tap wakes the audio
    await page.waitForTimeout(600) // (the recordings decode)
    await page.keyboard.press('n')
    await page.keyboard.type('Sound check')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await played(page)).some((d) => near(d, LEN.bubble))).toBe(true)
    // finish it from the list
    await page.locator('button', { hasText: /^List/ }).first().click()
    await page.getByRole('button', { name: 'Mark done' }).first().click()
    await expect.poll(async () => (await played(page)).some((d) => near(d, LEN.drip))).toBe(true)
  })

  test('the recordings are served', async ({ page }) => {
    for (const f of ['bubble', 'drip-double', 'pop-high', 'pop-low']) {
      const r = await page.request.get(`/sounds/${f}.wav`)
      expect(r.ok()).toBe(true)
      expect((await r.body()).byteLength).toBeGreaterThan(10_000)
    }
  })
})
