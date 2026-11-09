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

  test('dragging a group onto another nests it, with an indent hint on the way @smoke', async ({ page }) => {
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

test('on a desktop the menu can be dragged wider, remembers it, and double-click puts it back', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await open(page)
  const aside = page.locator('aside').first()
  const width = async () => Math.round((await aside.boundingBox())!.width)
  const before = await width()
  const handle = page.getByRole('separator', { name: /Menu width/ })
  const h = (await handle.boundingBox())!
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x + h.width / 2 + 120, h.y + h.height / 2, { steps: 8 })
  await page.mouse.up()
  expect(await width()).toBeGreaterThan(before + 100)
  // it is kept (on this device) and cannot be dragged past its limits
  await page.reload()
  await page.locator('aside nav button').first().waitFor()
  expect(await width()).toBeGreaterThan(before + 100)
  const h2 = (await page.getByRole('separator', { name: /Menu width/ }).boundingBox())!
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2)
  await page.mouse.down()
  await page.mouse.move(h2.x + h2.width / 2 + 600, h2.y + h2.height / 2, { steps: 8 })
  await page.mouse.up()
  expect(await width()).toBeLessThanOrEqual(562)
  await page.getByRole('separator', { name: /Menu width/ }).dblclick()
  expect(Math.abs((await width()) - before)).toBeLessThan(3)
})
