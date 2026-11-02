import { expect, test } from '@playwright/test'
import { open } from './helpers'

// Each recording's length (seconds), to tell which one played.
const LEN = { drop: 0.281, drip: 0.261, down: 0.246, trio: 0.54 }

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

  test('adding an item plays the water drop, checking one off plays the double drip, and the drip is used for nothing else', async ({ page }) => {
    await page.mouse.click(600, 400) // any tap wakes the audio
    await page.waitForTimeout(600) // (the recordings decode)
    await page.keyboard.press('n')
    await page.keyboard.type('Sound check')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await played(page)).some((d) => near(d, LEN.drop))).toBe(true)
    // finish it from the list
    await page.locator('button', { hasText: /^List/ }).first().click()
    await page.getByRole('button', { name: 'Mark done' }).first().click()
    await expect.poll(async () => (await played(page)).some((d) => near(d, LEN.drip))).toBe(true)
    // adding it played no drip: the double drip belongs to checking off alone
    expect((await played(page)).filter((d) => near(d, LEN.drip))).toHaveLength(1)
    // un-checking plays the same two drips the other way round (a habit's tick: its row does not fade away like a finished task's)
    await page.getByRole('button', { name: 'Done this one' }).first().click()
    await page.getByRole('button', { name: 'Undo this one' }).first().click()
    await expect.poll(async () => (await played(page)).some((d) => near(d, LEN.down))).toBe(true)
  })

  test('the recordings are served', async ({ page }) => {
    for (const f of ['drop-wet', 'bubbles-wet', 'bubble-trio', 'drip-double', 'drip-down', 'pop-high', 'pop-low']) {
      const r = await page.request.get(`/sounds/${f}.wav`)
      expect(r.ok()).toBe(true)
      expect((await r.body()).byteLength).toBeGreaterThan(10_000)
    }
  })
})
