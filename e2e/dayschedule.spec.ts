import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

const ev0 = (page: import('@playwright/test').Page) => page.locator('[data-event]').first()

test.describe('the day as a schedule', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'Calendar')
    await page.getByRole('button', { name: 'day', exact: true }).click()
    await page.getByRole('group', { name: 'Day layout' }).getByRole('button', { name: 'Schedule' }).click()
  })

  test('planning into an empty spot makes an event; duration and end stay linked; dragging its edge changes how long it takes', async ({ page }) => {
    const grid = page.locator('[data-day-schedule]')
    await expect(grid).toBeVisible()
    const box = (await grid.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + 300)
    // the new event opens in its details
    const dlg = page
    await expect(dlg.getByText('Duration')).toBeVisible()
    await dlg.getByRole('button', { name: /Duration/ }).click()
    await page.getByRole('button', { name: '30 min', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).last().click()
    // 30 minutes after the start: the end followed
    await expect(dlg.getByRole('button', { name: 'Duration: 30 min' })).toBeVisible()
    await expect(ev0(page)).toHaveAttribute('title', 'New event · 8:30 am – 9 am')
    await page.keyboard.press('Escape')
    await expect(dlg.getByRole('button', { name: 'Duration: 30 min' })).toBeHidden()

    const ev = page.locator('[data-event]').first()
    await expect(ev).toBeVisible()
    const h0 = (await ev.boundingBox())!.height
    const grip = ev.getByRole('separator')
    const g = (await grip.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 78, { steps: 6 })
    await page.mouse.up()
    const h1 = (await ev.boundingBox())!.height
    expect(h1).toBeGreaterThan(h0 + 60) // an hour longer is 78px more
    await page.screenshot({ path: 'test-results/day-schedule.png' })
  })
})
