import { expect, test } from '@playwright/test'
import { goto, open, taskNamed } from './helpers'

const d = new Date()
d.setDate(d.getDate() + 12)
const SOON = `${d.getMonth() + 1}/${d.getDate()}`

test.describe('quick add and fuzzy reminders', () => {
  test.beforeEach(({ page }) => open(page))

  test('"remind me a day before" needs no time and sets a morning-before reminder', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type(`Renew passport ${SOON} remind me a day before`)
    await expect(page.getByText('Remind a day before')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await taskNamed(page, 'Renew passport'))?.remindBefore).toBe(1)
    const t = (await taskNamed(page, 'Renew passport'))!
    const at = new Date(t.remindAt)
    expect(at.getHours()).toBe(9)
    expect(at.getDate()).toBe(d.getDate() - 1 || at.getDate())
  })

  test('"remind me tomorrow evening" picks an evening hour', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Call mom remind me tomorrow evening')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await taskNamed(page, 'Call mom'))?.remindAt).toBeTruthy()
    expect(new Date((await taskNamed(page, 'Call mom'))!.remindAt).getHours()).toBe(18)
  })

  test('the item panel offers Day before / Week before once the item has a date', async ({ page }) => {
    await goto(page, 'List') // a new item opens its details here
    await page.keyboard.press('n')
    await page.keyboard.type(`Submit form ${SOON}`)
    await page.keyboard.press('Enter')
    await expect(page.getByText('Remind me')).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Day before' })).toBeVisible()
    await page.getByRole('radio', { name: 'Day before' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Submit form'))?.remindBefore).toBe(1)
  })
})
