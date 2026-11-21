import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

async function enter(page: import('@playwright/test').Page, attached = true) {
  await page.addInitScript((a) => {
    if (!localStorage.getItem('lilac-spatial-v5')) localStorage.setItem('lilac-spatial-v5', JSON.stringify({ state: { attached: a }, version: 3 }))
  }, attached)
  await open(page)
  await goto(page, 'Spatial')
  await page.locator('[data-hub]').first().waitFor()
  await page.waitForTimeout(800)
}
const layout = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-spatial-v5')!).state.layout)

test.describe('the flat Space view', () => {
  test.use({ viewport: { width: 1300, height: 900 } })

  test('the view is described as Wall, and the fold arrows are big enough to hit', async ({ page }) => {
    await enter(page)
    await expect(page.locator('button', { hasText: /^Spatial/ }).first()).toContainText('Wall')
    const b = (await page.getByRole('region', { name: 'Spatial workspace' }).getByRole('button', { name: /^Fold / }).first().boundingBox())!
    // (the canvas may be scaled: judge it against the group's name beside it, which it used to be half the height of)
    const hub = (await page.locator('[data-hub]').first().boundingBox())!
    expect(b.height / hub.height).toBeGreaterThanOrEqual(0.9)
  })

  test('with subgroups free, a group moves alone; attached, they go with it', async ({ page }) => {
    await enter(page, false)
    const before = await layout(page)
    const hub = (await page.locator('[data-hub="school"]').boundingBox())!
    const x = hub.x + hub.width - 20
    await page.mouse.move(x, hub.y + hub.height / 2)
    await page.mouse.down()
    await page.mouse.move(x + 8, hub.y + 20, { steps: 2 })
    await page.mouse.move(x + 40, hub.y - 130, { steps: 14 })
    await page.mouse.up()
    await page.waitForTimeout(600)
    const after = await layout(page)
    expect(Math.abs(after.clusters.school.a - before.clusters.school.a) + Math.abs(after.clusters.school.y - before.clusters.school.y)).toBeGreaterThan(0.01)
    for (const k of ['eng101', 'bio']) {
      const o = Math.abs(after.clusters[k].a - before.clusters[k].a) + Math.abs(after.clusters[k].y - before.clusters[k].y)
      expect(o).toBeLessThan(0.15)
    }
  })

  test('off-screen dots are centred on the frame\'s own line', async ({ page }) => {
    await enter(page)
    await page.mouse.move(700, 500)
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -400)
    await page.waitForTimeout(500)
    await expect.poll(() => page.locator('.edge-dot').count()).toBeGreaterThan(0)
    const frame = (await page.getByRole('region', { name: 'Spatial workspace' }).boundingBox())!
    const ok = await page.locator('.edge-dot').evaluateAll(
      (els, f) =>
        els.every((e) => {
          const r = e.getBoundingClientRect()
          const x = r.left + r.width / 2
          const y = r.top + r.height / 2
          return Math.min(Math.abs(x - f.x), Math.abs(x - (f.x + f.w)), Math.abs(y - f.y), Math.abs(y - (f.y + f.h))) <= 2
        }),
      { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
    )
    expect(ok).toBe(true)
  })
})

test.describe('clean up on a phone', () => {
  test('lays the groups out tall for a portrait screen', async ({ page }) => {
    await enter(page)
    await page.setViewportSize({ width: 390, height: 800 })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Clean up' }).click()
    await page.waitForTimeout(900)
    const l = await layout(page)
    const cs = Object.values(l.clusters) as { a: number; r: number; y: number }[]
    const w = Math.max(...cs.map((c) => c.a * c.r)) - Math.min(...cs.map((c) => c.a * c.r))
    const h = Math.max(...cs.map((c) => c.y)) - Math.min(...cs.map((c) => c.y))
    expect(w / h).toBeLessThan(1)
  })
})
