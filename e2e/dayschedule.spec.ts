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

  // FIXME: these click at fixed offsets in the scrolling day and depend on the time of day they are run (they fail in the afternoon).
  test.fixme('planning into an empty spot makes an event; duration and end stay linked; dragging its edge changes how long it takes', async ({ page }) => {
    const grid = page.locator('[data-day-schedule]')
    await expect(grid).toBeVisible()
    // click inside the part of the (scrolling) day that is on screen
    const view = (await grid.locator('xpath=..').boundingBox())!
    await page.mouse.click(view.x + view.width / 2, view.y + 130)
    // the new event opens in its details
    const dlg = page
    await expect(dlg.getByText('Duration')).toBeVisible()
    await dlg.getByRole('button', { name: /Duration/ }).click()
    await page.getByRole('button', { name: '30 min', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).last().click()
    // 30 minutes after the start: the end followed
    await expect(dlg.getByRole('button', { name: 'Duration: 30 min' })).toBeVisible()
    // (the grid's first hour depends on the time of day, so read the times back from the block rather than assuming them)
    const mins = (t: string) => {
      const [, h, m, ap] = t.match(/(\d+)(?::(\d+))? (am|pm)/)!
      return (Number(h) % 12) * 60 + Number(m ?? 0) + (ap === 'pm' ? 720 : 0)
    }
    const [a, b] = (await ev0(page).getAttribute('title'))!.split(' · ')[1].split(' – ')
    expect(mins(b) - mins(a)).toBe(30)
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

  test.fixme('"end as late as fits" stretches an event out to the next one', async ({ page }) => {
    const grid = page.locator('[data-day-schedule]')
    // click inside the part of the (scrolling) day that is on screen
    const view = (await grid.locator('xpath=..').boundingBox())!
    const x = view.x + view.width / 2
    await page.mouse.click(x, view.y + 70)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /^Duration/ })).toBeHidden()
    await page.mouse.click(x, view.y + 230) // a couple of hours later
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /^Duration/ })).toBeHidden()
    const events = page.locator('[data-event]')
    await expect(events).toHaveCount(2)
    const second = (await events.nth(1).getAttribute('title'))!.match(/· (\d+:\d+ \w+) –/)![1]
    await events.first().click()
    await page.getByRole('button', { name: /End as late as fits/ }).click()
    await expect(events.first()).toHaveAttribute('title', new RegExp(`– ${second}$`))
    await expect(page.getByRole('button', { name: /End as late as fits/ })).toBeDisabled()
  })
})
