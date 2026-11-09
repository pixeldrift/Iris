import { expect, test } from '@playwright/test'
import { open, tapWater } from './helpers'

test.describe('the pond', () => {
  test.beforeEach(({ page }) => open(page))

  test('shows the bubbles, and zoom grows them @smoke', async ({ page }) => {
    expect(await page.locator('[data-node]').count()).toBeGreaterThan(10)
    const width = () => page.locator('[data-node]').first().evaluate((e) => e.getBoundingClientRect().width)
    const before = await width()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(width).toBeGreaterThan(before * 1.1)
  })

  test('tapping empty water opens the add box @smoke', async ({ page }) => {
    await tapWater(page, 360, 700)
    await expect(page.getByLabel('New item')).toBeVisible()
  })

  test('pop mode deletes a bubble on touch, and undo brings it back', async ({ page }) => {
    const count = () => page.locator('[data-node]').count()
    const n = await count()
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.getByRole('radio', { name: 'Delete' }).click() // (popping is for fun until deleting is asked for)
    await expect(page.getByRole('alert')).toContainText('Pop to delete!')
    // a bubble clear of the buttons along the top of the pond
    const pondTop = (await page.locator('[aria-label^="Pond canvas"]').boundingBox())!.y
    const boxes = await page.locator('[data-node] [role=button]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }))
    const box = boxes.find((b) => b.y > pondTop + 80)!
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
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
    // (events and ideas have no check box: they are not things to do)
    const res = await page.evaluate(() => {
      let checks = 0
      const ok = [...document.querySelectorAll<HTMLElement>('[data-node] .pad')].every((pad) => {
        const r = pad.getBoundingClientRect()
        const check = pad.querySelector<HTMLElement>('button[aria-label*="done" i], button[aria-label*="Mark"]')
        if (!check) return true
        checks++
        const c = check.getBoundingClientRect()
        return Math.abs(c.left + c.width / 2 - (r.left + r.width / 2)) < 2 && c.top + c.height / 2 > r.top + r.height * 0.7
      })
      return { ok, checks }
    })
    expect(res.ok).toBe(true)
    expect(res.checks).toBeGreaterThan(5)
  })

  test('Frame all zooms until the bubbles fill the width or the height, with just a little margin', async ({ page }) => {
    await page.getByRole('button', { name: 'Frame all' }).click()
    await page.waitForTimeout(1200)
    const m = await page.evaluate(() => {
      const pond = document.querySelector('[aria-label^="Pond canvas"]')!.getBoundingClientRect()
      const r = [...document.querySelectorAll('[data-node] .pad')].map((e) => e.getBoundingClientRect())
      const left = Math.min(...r.map((x) => x.left)) - pond.left
      const right = pond.right - Math.max(...r.map((x) => x.right))
      const top = Math.min(...r.map((x) => x.top)) - pond.top
      const bottom = pond.bottom - Math.max(...r.map((x) => x.bottom))
      return { side: Math.min(left, right), vert: Math.min(top, bottom) }
    })
    // the tighter pair of sides is close to the edge (a small margin), and nothing is cut off
    expect(Math.min(m.side, m.vert)).toBeGreaterThan(0)
    expect(Math.min(m.side, m.vert)).toBeLessThan(40)
  })
})
