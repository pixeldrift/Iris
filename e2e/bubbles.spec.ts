import { expect, test, type Page } from '@playwright/test'
import { goto, open } from './helpers'

/** Every part of a bubble's furniture (type icon, checkbox, call button, bell, counts) must sit inside its circle. */
async function outside(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = []
    for (const pad of document.querySelectorAll<HTMLElement>('[data-node] .pad')) {
      const b = pad.getBoundingClientRect()
      if (b.width < 8) continue
      const R = b.width / 2
      const cx = b.left + R
      const cy = b.top + b.height / 2
      const chrome = [...pad.children].filter((c) => (c as HTMLElement).style.transform.includes('scale(')).at(-1)
      if (!chrome) continue
      for (const el of chrome.querySelectorAll<HTMLElement>(':scope > span')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0) continue
        // the farthest corner of the element from the circle's centre
        const far = Math.max(...[[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => Math.hypot(x - cx, y - cy)))
        if (far > R + 1.5) bad.push(`${(pad.textContent ?? '').slice(0, 18)} R=${R.toFixed(0)} far=${far.toFixed(0)}`)
      }
    }
    return bad
  })
}

test.describe('bubble furniture stays inside the bubble at every size', () => {
  test.use({ viewport: { width: 1000, height: 700 } })
  test.beforeEach(({ page }) => open(page))

  test('pond, zoomed out and in', async ({ page }) => {
    expect(await outside(page)).toEqual([])
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.waitForTimeout(600)
    expect(await outside(page)).toEqual([])
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.waitForTimeout(600)
    expect(await outside(page)).toEqual([])
  })

  test('priority grid, smallest to largest bubbles', async ({ page }) => {
    await goto(page, 'Priority')
    expect(await outside(page)).toEqual([])
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
    await page.waitForTimeout(500)
    expect(await outside(page)).toEqual([])
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.waitForTimeout(500)
    expect(await outside(page)).toEqual([])
  })
})
