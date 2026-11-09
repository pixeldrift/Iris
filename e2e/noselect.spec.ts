import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test.describe('nothing is highlighted by dragging', () => {
  test('text and images are not selectable in any view, but text boxes still select @slow', async ({ page }) => {
    await open(page)
    for (const view of ['Pond', 'List', 'Progress', 'Priority', 'Calendar', 'Timeline', 'Overview']) {
      await goto(page, view)
      const sel = await page.evaluate(() => getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect)
      expect(sel).toBe('none')
      // drag across the middle of the page: nothing ends up selected
      const box = (await page.locator('main').boundingBox())!
      await page.mouse.move(box.x + 20, box.y + 120)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width - 20, box.y + box.height - 40, { steps: 6 })
      await page.mouse.up()
      expect(await page.evaluate(() => String(window.getSelection()))).toBe('')
      await page.keyboard.press('Escape')
    }
    await goto(page, 'List')
    await page.keyboard.press('n')
    const input = page.getByLabel('New item')
    await input.fill('select me')
    expect(await input.evaluate((e) => getComputedStyle(e).userSelect)).toBe('text')
  })
})
