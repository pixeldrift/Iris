import { expect, test } from '@playwright/test'
import { drag, folderRow, open, tree } from './helpers'

test.describe('the sidebar', () => {
  // tall enough that every group row is on screen
  test.use({ viewport: { width: 1200, height: 1400 } })
  test.beforeEach(({ page }) => open(page))

  test('the count bubble opens add / rename / delete, and rename can be undone', async ({ page }) => {
    const row = page.locator('[data-folder-row]').first()
    await row.locator('button[aria-haspopup=menu]').click()
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Rename' }).click()
    await page.keyboard.type('Zed')
    await page.keyboard.press('Enter')
    await expect(row).toContainText('Zed')
    await page.keyboard.press('Control+z')
    await expect(row).not.toContainText('Zed')
  })

  test('dragging a group onto another nests it, with an indent hint on the way', async ({ page }) => {
    const life = (await folderRow(page, 'Life').boundingBox())!
    const garden = (await folderRow(page, 'Garden').boundingBox())!
    await drag(page, { x: life.x + 100, y: life.y + 20 }, { x: life.x + 100, y: garden.y + garden.height / 2 }, { release: false })
    await expect(page.locator('[data-hint="in"]')).toHaveCount(1)
    await page.mouse.up()
    await expect.poll(() => tree(page)).toContain('2:Life')
  })

  test('pulling a second-level group left makes it first level, wherever it sits in its parent', async ({ page }) => {
    const row = (await folderRow(page, 'English 101').boundingBox())!
    await drag(page, { x: row.x + 120, y: row.y + 20 }, { x: row.x + 75, y: row.y + 24 }, { steps: 8, release: false })
    await expect(page.locator('[data-hint="out"]')).toHaveCount(1)
    await page.mouse.up()
    await expect.poll(() => tree(page)).toContain('0:English 101')
  })

  test('opening a group filters the view to it', async ({ page }) => {
    await folderRow(page, 'Garden').click()
    await expect(page.locator('header h2')).toHaveText('Pond')
    await expect.poll(() => page.locator('[data-node]').count()).toBeLessThan(8)
  })
})
