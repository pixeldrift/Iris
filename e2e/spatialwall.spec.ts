import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

// a stand-in camera: a textured wall with a white sheet of paper on it, drawn to a canvas and streamed
test.use({ permissions: ['camera'] })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 480
    const g = c.getContext('2d')!
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const draw = () => {
      g.fillStyle = '#6a6a72'
      g.fillRect(0, 0, 640, 480)
      seed = 7
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgb(${80 + rnd() * 60},${80 + rnd() * 60},${90 + rnd() * 60})`
        g.fillRect(rnd() * 640, rnd() * 480, 6 + rnd() * 14, 6 + rnd() * 14)
      }
      g.fillStyle = '#f4f4f0'
      g.fillRect(200, 130, 240, 220) // the sheet
      g.fillStyle = '#333'
      for (let i = 0; i < 14; i++) g.fillRect(215 + (i % 4) * 55, 145 + Math.floor(i / 4) * 50, 30, 8)
    }
    draw()
    const stream = c.captureStream(15)
    setInterval(draw, 66)
    navigator.mediaDevices.getUserMedia = () => Promise.resolve(stream)
  })
})

test.describe('wall mode', () => {
  test('finds a sheet of paper and holds on to it; leaving lets go of the camera', async ({ page }) => {
    await open(page)
    await goto(page, 'Space')
    await page.getByRole('button', { name: 'Use touch only' }).click()
    await page.getByRole('radio', { name: 'Wall' }).click()
    await expect(page.locator('[data-wall-status]')).toBeVisible()
    await expect(page.locator('video')).toHaveCount(1)
    await expect(page.locator('[data-wall-status="holding"]')).toBeVisible({ timeout: 15000 })
    if (process.env.SHOT) {
      await page.waitForTimeout(Number(process.env.SHOT_AT ?? 0))
      await page.screenshot({ path: process.env.SHOT })
    }
    // the picture is hidden (2px) while the background is Virtual; Camera shows it full size, Photo or Virtual puts it back
    const box = () => page.locator('video').evaluate((v) => v.getBoundingClientRect().width)
    expect(await box()).toBeLessThan(10)
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    await page.getByRole('radio', { name: 'Camera' }).click()
    await expect.poll(box).toBeGreaterThan(300)
    await page.getByRole('radio', { name: 'Virtual' }).click()
    await expect.poll(box).toBeLessThan(10)
    await page.keyboard.press('Escape')
    const stream = await page.evaluateHandle(() => document.querySelector('video')!.srcObject as MediaStream)
    await page.getByRole('radio', { name: '3D' }).click()
    await expect(page.locator('[data-wall-status]')).toHaveCount(0)
    await expect.poll(() => stream.evaluate((s) => (s as MediaStream).getTracks().every((t) => t.readyState === 'ended'))).toBe(true)
  })
})
