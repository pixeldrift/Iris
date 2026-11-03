import { expect, test } from '@playwright/test'
import { goto, open, taskNamed } from './helpers'

test.describe('repeats that end, and skipping one', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    await page.keyboard.press('n')
    await page.keyboard.type('Feed the starter every day')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('radiogroup', { name: 'Ends' })).toBeVisible()
  })

  test('ends after a number of times, or on a date, or never', async ({ page }) => {
    await page.getByRole('radio', { name: 'After' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Feed the starter'))?.repeat?.count).toBe(10)
    for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Fewer times' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Feed the starter'))?.repeat?.count).toBe(3)
    await expect(page.getByText('Every day, 3 times')).toBeVisible()
    await page.getByRole('radio', { name: 'On a date' }).click()
    await expect.poll(async () => {
      const r = (await taskNamed(page, 'Feed the starter'))?.repeat
      return !!r?.until && r.count === undefined
    }).toBe(true)
    await expect(page.getByText(/^Every day, until /)).toBeVisible()
    await page.getByRole('radio', { name: 'Never' }).click()
    await expect.poll(async () => {
      const r = (await taskNamed(page, 'Feed the starter'))?.repeat
      return !!r && r.until === undefined && r.count === undefined
    }).toBe(true)
  })

  test('skip the next one, and put it back', async ({ page }) => {
    await page.getByRole('button', { name: /^Skip / }).click()
    await expect.poll(async () => (await taskNamed(page, 'Feed the starter'))?.repeat?.skip?.length).toBe(1)
    const skipped = page.getByLabel('Skipped days')
    await expect(skipped).toContainText('Skipped')
    // the button now offers the day after
    await expect(page.getByRole('button', { name: /^Skip / })).toBeVisible()
    await skipped.getByRole('button', { name: /^Don't skip/ }).click()
    await expect.poll(async () => (await taskNamed(page, 'Feed the starter'))?.repeat?.skip?.length ?? 0).toBe(0)
  })
})
