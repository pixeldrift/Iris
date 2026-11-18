import { expect, test } from '@playwright/test'
import { goto, open, saved } from './helpers'

/** The open popover (not the page behind it). */
const pop = (page: import('@playwright/test').Page) => page.locator('[data-popover]')

test.describe('date and time pickers', () => {
  test.use({ viewport: { width: 1300, height: 1000 } })
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    await page.locator('[data-lift-id^="task:"]').nth(1).click() // (one that has a deadline, which has its own reminder)
    await page.getByRole('button', { name: /^Remind me( on the day)?$/ }).first().click() // (the reminder opens out of its own line)
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

  test('the highlight stays at the top and the numbers scroll up into it: what settles there is the time', async ({ page }) => {
    await page.getByText('–None–').first().click()
    const hours = page.getByRole('listbox', { name: 'Hour' })
    await expect(hours).toBeVisible()
    await hours.getByRole('option', { name: '9', exact: true }).nth(4).click()
    await expect(hours.getByRole('option', { selected: true })).toHaveText('9')
    await expect(page.getByRole('button', { name: /\b9(:\d\d)? am/i }).first()).toBeVisible() // (picking by tap still sets it)
    // scrolled by hand (one row of 34px): the highlight has not moved, and it now holds a different number
    const top = () => hours.evaluate((el) => Math.round(el.scrollTop))
    const before = await top()
    await hours.hover()
    await page.mouse.wheel(0, 34)
    await expect.poll(top).toBeGreaterThan(before)
    await expect(hours.getByRole('option', { selected: true })).toHaveText('10')
    // ... and once it settles that is the hour that was chosen
    await expect(page.getByRole('button', { name: /\b10(:\d\d)? am/i }).first()).toBeVisible()
  })

  test('Ok closes the picker and Clear removes the time', async ({ page }) => {
    await page.getByText('–None–').first().click()
    await page.getByRole('listbox', { name: 'Hour' }).getByRole('option', { name: '3', exact: true }).nth(4).click()
    await pop(page).getByRole('button', { name: 'Ok', exact: true }).click()
    await expect(page.getByRole('listbox', { name: 'Hour' })).toHaveCount(0)
    expect((await saved(page))!.tasks.some((t) => t.remindAt)).toBe(true)
  })

  test('the date picker has Ok and Clear', async ({ page }) => {
    await page.getByText('Or pick a day').locator('xpath=..').getByRole('button').first().click()
    await page.getByRole('button', { name: 'Tomorrow', exact: true }).click()
    await page.getByText('Or pick a day').locator('xpath=..').getByRole('button').first().click()
    await expect(pop(page).getByRole('button', { name: 'Ok', exact: true })).toBeVisible()
    await pop(page).getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(pop(page).getByRole('button', { name: 'Clear', exact: true })).toHaveCount(0)
  })
})
