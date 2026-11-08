import { expect, test } from '@playwright/test'
import { open, saved } from './helpers'

test.describe('hiding views you do not use', () => {
  test('the list is folded by default; an unchecked view leaves the sidebar, and the last one cannot be hidden', async ({ page }) => {
    await open(page)
    const side = page.getByRole('button', { name: 'Timeline', exact: false })
    await expect(side.first()).toBeVisible()
    await page.getByRole('button', { name: 'My settings' }).click()
    const dialog = page.getByRole('dialog')
    // folded: no checkboxes until it is opened
    await expect(dialog.getByRole('checkbox', { name: /Timeline/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: /Views in the sidebar/ }).click()
    await dialog.getByRole('checkbox', { name: /Timeline/ }).uncheck()
    await dialog.getByRole('checkbox', { name: /Overview/ }).uncheck()
    await expect.poll(async () => (await saved(page))!.settings.hiddenViews).toEqual(['timeline', 'overview'])
    await dialog.getByRole('button', { name: 'Close settings' }).click()
    await expect(page.getByRole('button', { name: /^Timeline/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Overview/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^List/ }).first()).toBeVisible()
  })

  test('hiding the view you are in moves you to one that is shown', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'My settings' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /Views in the sidebar/ }).click()
    await dialog.getByRole('checkbox', { name: /Pond/ }).uncheck()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.view)).not.toBe('pond')
  })
})
