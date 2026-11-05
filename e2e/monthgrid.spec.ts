import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test.describe('the month as an endless grid', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'Calendar')
  })

  test('dragging the grid scrolls it and the title shows both months; the arrows slide whole months', async ({ page }) => {
    const title = page.locator('main h3').first()
    const whole = await title.innerText()
    expect(whole).toMatch(/^[A-Z][a-z]+ \d{4}$/)
    const box = (await page.locator('[data-month-scroll]').boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height * 0.75
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 120, { steps: 6 })
    await page.mouse.move(x, y - 250, { steps: 6 })
    await page.mouse.up()
    await expect(title).toContainText('–') // a split, like Nov–Dec 2026
    expect(await page.locator('[role=dialog]').count()).toBe(0) // (the drag did not open a day)
    // Next slides to a whole month (no split), and again to the one after; Previous goes back to the first of those
    const whole1 = /^[A-Z][a-z]+ \d{4}$/
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(title).toHaveText(whole1, { timeout: 4000 })
    const t1 = await title.innerText()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(title).not.toHaveText(t1, { timeout: 4000 })
    await expect(title).toHaveText(whole1)
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect(title).toHaveText(t1, { timeout: 4000 })
    // Today comes back to this month
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await expect(title).toHaveText(whole, { timeout: 4000 })
  })

  test('the first day of each month carries the month name', async ({ page }) => {
    await expect(page.locator('[data-month-scroll]').getByText(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/).first()).toBeVisible()
  })

  test('there are no rolling options in the settings, and no notch setting', async ({ page }) => {
    await page.getByRole('button', { name: 'My settings' }).click()
    await expect(page.getByRole('radio', { name: 'Next 30 days' })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: 'Next 7 days' })).toHaveCount(0)
    await expect(page.getByText('Notch')).toHaveCount(0)
  })

  test('the controls are on one line wide, with Today a pill; upright, Today sits under the month', async ({ page }) => {
    const title = page.locator('main h3').first()
    const today = page.getByRole('button', { name: 'Today', exact: true })
    const link = page.getByRole('button', { name: 'Hide weekends' })
    const toggleBtn = page.getByRole('button', { name: 'month', exact: true })
    const mid = async (l: ReturnType<typeof page.locator>) => {
      const b = (await l.boundingBox())!
      return b.y + b.height / 2
    }
    expect(Math.abs((await mid(title)) - (await mid(today)))).toBeLessThan(12)
    await expect(link).toBeHidden() // (only on a phone held upright)
    const right = (await toggleBtn.boundingBox())!.x
    await page.getByRole('button', { name: 'Next' }).click() // the toggle does not move when the month name changes
    await page.waitForTimeout(600)
    expect(Math.abs((await toggleBtn.boundingBox())!.x - right)).toBeLessThan(1)
    await expect(today).toHaveClass(/bg-lilac-100/) // a pill
    await page.setViewportSize({ width: 390, height: 780 })
    await expect.poll(async () => (await mid(today)) - (await mid(title))).toBeGreaterThan(14)
    // the weekends link is on the second line, opposite Today and under the view toggle (which stays on the month's line)
    await expect.poll(async () => Math.abs((await mid(link)) - (await mid(today)))).toBeLessThan(8)
    const toggle = page.getByRole('button', { name: 'month', exact: true })
    await expect.poll(async () => Math.abs((await mid(toggle)) - (await mid(title)))).toBeLessThan(14)
    expect((await link.boundingBox())!.x).toBeGreaterThan((await today.boundingBox())!.x)
  })

  test('a violet line sits between a month’s last and first days; the month name on a first day is serif, bold and purple', async ({ page }) => {
    await expect(page.locator('[data-month-scroll] svg.pointer-events-none path')).toHaveAttribute('d', /M/)
    const label = page.locator('[data-month-scroll]').getByText(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/).first()
    await expect(label).toHaveClass(/font-display/)
    await expect(label).toHaveClass(/text-lilac-500/)
    await expect(label).toHaveClass(/font-bold/)
  })

  test('arrows name one month (never a split) while sliding; the top edge fades once scrolled', async ({ page }) => {
    const title = page.locator('main h3').first()
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Next' }).click()
      for (let t = 0; t < 12; t++) {
        expect(await title.innerText()).not.toContain('–')
        await page.waitForTimeout(60)
      }
    }
    await expect(page.locator('[data-month-scroll]')).toHaveAttribute('data-top', '')
  })

  test('unscheduled items sit under a line: two rows, opened by "Unscheduled" (up to a third of the screen)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 }) // narrow enough for several rows of them
    const toggle = page.getByRole('button', { name: 'Unscheduled' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const list = page.locator('[aria-label=Unscheduled]')
    const closed = (await list.boundingBox())!.height
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(async () => (await list.boundingBox())!.height).toBeGreaterThan(closed)
    const vh = page.viewportSize()!.height
    expect((await page.locator('[aria-label=Unscheduled]').locator('xpath=ancestor::div[contains(@class,"fade-mask")][1]').boundingBox())!.height).toBeLessThanOrEqual(vh / 3 + 2)
  })

  test('pulling a dragged item above the top of the days scrolls the calendar along', async ({ page }) => {
    const grid = page.locator('[data-month-scroll]')
    const gb = (await grid.boundingBox())!
    const before = await grid.evaluate((e) => e.scrollTop)
    const pill = page.locator('[aria-label=Unscheduled] > div').first()
    const pb = (await pill.boundingBox())!
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2)
    await page.mouse.down()
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2, { steps: 8 })
    await page.mouse.move(gb.x + gb.width / 2, gb.y - 6, { steps: 6 })
    await page.waitForTimeout(700)
    const up = await grid.evaluate((e) => e.scrollTop)
    expect(up).toBeLessThan(before - 20)
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height + 10, { steps: 6 })
    await page.waitForTimeout(900)
    expect(await grid.evaluate((e) => e.scrollTop)).toBeGreaterThan(up + 20)
    await page.mouse.up()
  })

  test('Today (and the arrows) leave the first week of the month clear of the top fade', async ({ page }) => {
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await page.waitForTimeout(1200)
    const d = new Date()
    const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const grid = (await page.locator('[data-month-scroll]').boundingBox())!
    const cell = (await page.locator(`[data-month-scroll] [data-drop="day:${first}"]`).boundingBox())!
    expect(cell.y - grid.y).toBeGreaterThan(36)
  })

  test('the month is spelled out unless there is not room; on a narrow phone it still fits', async ({ page }) => {
    const title = page.locator('main h3').first()
    await expect(title).toHaveText(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/)
    await page.setViewportSize({ width: 340, height: 700 })
    await page.waitForTimeout(500)
    expect(await title.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  })

  test('the month name sits in the space above the first day’s box, so the number stays in line; days hold two rows of dots, then a plus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    const name = page.locator('[data-month-scroll]').locator('span.font-display').first()
    await expect(name).toHaveClass(/absolute/)
    const cell = name.locator('xpath=ancestor::*[@data-drop][1]')
    const nb = (await name.boundingBox())!
    const cb = (await cell.boundingBox())!
    expect(nb.y + nb.height).toBeLessThanOrEqual(cb.y + 1) // above the box, not over it
    // no day shows more than two rows of dots; a crowded one ends in a plus
    const rows = await page.locator('[data-month-scroll] [role=img]').evaluateAll((els) => Math.max(...els.map((e) => new Set([...e.children].map((k) => Math.round(k.getBoundingClientRect().top))).size)))
    expect(rows).toBeLessThanOrEqual(2)
    expect(await page.locator('[data-month-scroll] [role=img] > span[title$=" more"]').count()).toBeGreaterThan(0)
  })

  test('the unscheduled arrow points right when closed and down when open, and is only there when there is more to see', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    const toggle = page.getByRole('button', { name: 'Unscheduled' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle.locator('span')).not.toHaveClass(/rotate-90/)
    await toggle.click()
    await expect(toggle.locator('span')).toHaveClass(/rotate-90/)
  })
})
