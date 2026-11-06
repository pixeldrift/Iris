import { expect, test } from '@playwright/test'
import { folderRow, open } from './helpers'

test.describe('groups in the pond', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await page.getByRole('radiogroup', { name: 'Gather by' }).getByRole('radio', { name: 'Group' }).click()
    await page.waitForTimeout(500)
  })

  test('a group can be made from the pond, and is named there before anything is in it', async ({ page }) => {
    await page.getByRole('button', { name: '+ Group' }).click()
    await page.getByLabel('Group name').fill('Empty one')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.locator('.pond-label').filter({ hasText: 'Empty one' })).toBeVisible()
  })

  test('inside a group, a subgroup is made from the pond and named there while empty', async ({ page }) => {
    await folderRow(page, 'School').click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: '+ Subgroup' }).click()
    await page.getByLabel('Group name').fill('Fresh sub')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.locator('.pond-label').filter({ hasText: 'Fresh sub' })).toBeVisible()
  })
})

test('typing @ and a name nobody has in the quick add box does not freeze the app', async ({ page }) => {
  await open(page)
  await page.keyboard.press('n')
  await page.waitForTimeout(600)
  await page.keyboard.type('Call @Zq')
  const alive = await Promise.race([page.evaluate(() => 1).then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 6000))])
  expect(alive).toBe(true)
  await expect(page.getByRole('textbox').first()).toBeVisible()
})
