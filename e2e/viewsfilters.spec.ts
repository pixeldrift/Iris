import { expect, test } from '@playwright/test'
import { folderRow, goto, open } from './helpers'

test.describe('views and filters are two different things', () => {
  test.beforeEach(({ page }) => open(page))

  test('the filter is a path under the view name, and its first step clears it', async ({ page }) => {
    await goto(page, 'List')
    const sub = page.locator('header p').first()
    await expect(sub).toContainText('Filter: Everything')
    await folderRow(page, 'English 101').click()
    await expect(sub).toContainText(/Filter: Everything\s*›\s*School\s*›\s*English 101/)
    await sub.getByRole('button', { name: 'Everything' }).click()
    await expect(sub).toHaveText(/^Filter: Everything$/)
  })

  test('the views fold into a row of icons and back', async ({ page }) => {
    await page.getByRole('button', { name: 'Collapse Views' }).click()
    const row = page.getByRole('group', { name: 'Views' })
    await expect(row.getByRole('button')).toHaveCount(7)
    await row.getByRole('button', { name: 'Timeline' }).click()
    await expect(page.getByRole('heading', { name: 'Timeline', level: 2 })).toBeVisible()
    await page.getByRole('button', { name: 'Expand Views' }).click()
    await expect(page.getByRole('button', { name: /^Timeline/ })).toBeVisible()
  })

  test('"switching views clears filters" starts every view from Everything', async ({ page }) => {
    await goto(page, 'List')
    await folderRow(page, 'English 101').click()
    await goto(page, 'Progress')
    await expect(page.locator('header p').first()).toContainText('English 101') // kept, by default
    await page.getByRole('button', { name: 'My settings' }).click()
    await page.getByRole('switch', { name: /Switching views clears filters/ }).click()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await goto(page, 'Priority')
    await expect(page.locator('header p').first()).toHaveText(/^Filter: Everything$/)
  })
})
