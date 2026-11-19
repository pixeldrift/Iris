import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test.use({ viewport: { width: 1300, height: 900 } })

async function byGroup(page: import('@playwright/test').Page) {
  await open(page)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    raw.state.settings.sortKey = 'group'
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
    localStorage.removeItem('lilac-list-folded')
  })
  await page.reload()
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await goto(page, 'List')
}

test.describe('the list sorted by group', () => {
  test('each group has a heading with its name and how many it holds, and the groups are set well apart', async ({ page }) => {
    await byGroup(page)
    const life = page.locator('[data-group-head="life"]')
    await expect(life).toContainText('Life')
    await expect(life).toContainText('6')
    const heads = await page.locator('[data-group-head]').count()
    expect(heads).toBeGreaterThan(3)
    // room above a heading that follows another group's items
    const prev = (await page.locator('[data-card-id]').first().boundingBox())!
    expect(prev).toBeTruthy()
    const lifeBox = (await life.boundingBox())!
    const above = await life.evaluate((el) => (el.previousElementSibling as HTMLElement | null)?.getBoundingClientRect().bottom ?? 0)
    expect(lifeBox.y - above).toBeGreaterThanOrEqual(16)
  })

  test('the twirl folds a group\'s items away and brings them back, and remembers it', async ({ page }) => {
    await byGroup(page)
    const items = () => page.locator('[data-card-id]').filter({ hasText: /Study group|Book club|Call grandma/ })
    await expect(items().first()).toBeVisible()
    const before = await page.locator('[data-card-id]').count()
    await page.getByRole('button', { name: 'Fold Life' }).click()
    await expect(items()).toHaveCount(0)
    expect(await page.locator('[data-card-id]').count()).toBeLessThan(before)
    await expect(page.locator('[data-group-head="life"]')).toContainText('6') // (the count stays)
    await page.reload()
    await page.locator('[data-group-head]').first().waitFor()
    await expect(page.getByRole('button', { name: 'Show Life' })).toBeVisible()
    await page.getByRole('button', { name: 'Show Life' }).click()
    await expect(items().first()).toBeVisible()
  })
})
