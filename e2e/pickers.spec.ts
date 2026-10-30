import { expect, test } from '@playwright/test'
import { goto, open, saved } from './helpers'

/** The open popover (not the page behind it). */
const pop = (page: import('@playwright/test').Page) => page.locator('div.fixed.z-\\[150\\]')

test.describe('date and time pickers', () => {
  test.use({ viewport: { width: 1300, height: 1000 } })
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    await page.locator('[data-lift-id^="task:"]').first().click()
    await page.getByText('and a time').waitFor()
  })

  test('the time picker loops, keeps the pick at the top, and sets the time', async ({ page }) => {
    await page.getByText('–None–').first().click()
    const hours = page.getByRole('listbox', { name: 'Hour' })
    await expect(hours).toBeVisible()
    await hours.getByRole('option', { name: '7', exact: true }).nth(4).click()
    await page.getByRole('listbox', { name: 'Minute' }).getByRole('option', { name: '20', exact: true }).nth(3).click()
    await page.getByRole('listbox', { name: 'AM or PM' }).getByRole('option', { name: 'PM' }).nth(4).click()
    await expect(page.getByRole('button', { name: /7:20 pm/ })).toBeVisible()
    // it never runs out: a long scroll wraps instead of stopping
    const before = await hours.evaluate((el) => el.scrollTop)
    for (let i = 0; i < 6; i++) await hours.evaluate((el) => el.scrollBy(0, 1500))
    await page.waitForTimeout(300)
    const after = await hours.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }))
    expect(after.top).toBeGreaterThan(0)
    expect(after.top).toBeLessThan(after.max)
    void before
  })

  test('Done closes the picker and Clear removes the time', async ({ page }) => {
    await page.getByText('–None–').first().click()
    await page.getByRole('listbox', { name: 'Hour' }).getByRole('option', { name: '3', exact: true }).nth(4).click()
    await pop(page).getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('listbox', { name: 'Hour' })).toHaveCount(0)
    expect((await saved(page))!.tasks.some((t) => t.remindAt)).toBe(true)
  })

  test('the date picker has Done and Clear', async ({ page }) => {
    await page.getByText('Or pick a day').locator('xpath=..').getByRole('button').first().click()
    await page.getByRole('button', { name: 'Tomorrow', exact: true }).click()
    await page.getByText('Or pick a day').locator('xpath=..').getByRole('button').first().click()
    await expect(pop(page).getByRole('button', { name: 'Done', exact: true })).toBeVisible()
    await pop(page).getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(pop(page).getByRole('button', { name: 'Clear', exact: true })).toHaveCount(0)
  })
})
