import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('people in the sidebar and the address book', () => {
  test.use({ viewport: { width: 1200, height: 1400 } })
  test.beforeEach(({ page }) => open(page))

  test('every count bubble ends in one column, grips or not', async ({ page }) => {
    const rights = await page.locator('aside, nav').locator('span.rounded-full.tabular-nums').evaluateAll((els) =>
      els.filter((e) => /^\d+$/.test(e.textContent ?? '') && (e as HTMLElement).offsetParent).map((e) => Math.round(e.getBoundingClientRect().right)),
    )
    expect(rights.length).toBeGreaterThan(4)
    expect(Math.max(...rights) - Math.min(...rights)).toBeLessThanOrEqual(1)
  })

  test('favorites can be moved with their grips, and the order stays', async ({ page }) => {
    const names = () => page.locator('[data-reorder-row]').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    await page.getByRole('button', { name: /Address book/ }).click()
    await page.getByRole('button', { name: /^Favorite / }).first().click()
    await page.getByRole('button', { name: 'Everything' }).first().click()
    const before = await names()
    expect(before.length).toBeGreaterThan(1)
    await page.locator('[data-person-grip]').first().focus()
    await page.keyboard.press('ArrowDown')
    const after = await names()
    expect(after[1]).toBe(before[0])
    expect(after[0]).toBe(before[1])
    await page.reload()
    expect(await names()).toEqual(after)
  })

  test('the address book sorts by first or last name', async ({ page }) => {
    await page.getByRole('button', { name: /Address book/ }).click()
    const first = await page.locator('main button.text-left .truncate.text-\\[0\\.95rem\\]').allTextContents()
    await page.getByRole('radio', { name: 'Last name' }).click()
    const last = await page.locator('main button.text-left .truncate.text-\\[0\\.95rem\\]').allTextContents()
    expect(last.length).toBe(first.length)
    const lastOf = (n: string) => n.trim().split(/\s+/).pop()!.toLowerCase()
    const keys = last.map(lastOf)
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(keys)
  })

  test('favorites are carried like groups: lifted, a line shows the gap, and they land in the new place', async ({ page }) => {
    await page.getByRole('button', { name: /Address book/ }).click()
    for (let n = 0; n < 3; n++) await page.getByRole('button', { name: /^Favorite / }).first().click()
    await page.getByRole('button', { name: 'Everything' }).first().click()
    const names = () => page.locator('[data-reorder-row]').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    const before = await names()
    expect(before.length).toBeGreaterThan(2)
    const rows = page.locator('[data-reorder-row]')
    const a = (await rows.nth(0).boundingBox())!
    const c = (await rows.nth(2).boundingBox())!
    await page.mouse.move(a.x + 60, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + 60, a.y + a.height + 10, { steps: 4 })
    await page.mouse.move(a.x + 60, c.y + c.height - 2, { steps: 8 })
    await expect(page.locator('[data-gap] > div.opacity-100')).toHaveCount(1)
    await page.mouse.up()
    await expect.poll(names).not.toEqual(before)
    expect((await names())[0]).toBe(before[1])
  })
})
