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
})
