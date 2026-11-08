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
    await expect(row.getByRole('button')).toHaveCount(8)
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
    await page.getByRole('switch', { name: /Switching views resets filters/ }).click()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await goto(page, 'Priority')
    await expect(page.locator('header p').first()).toHaveText(/^Filter: Everything$/)
  })
})

test('several filters at once show as chips, each can be taken off, and "Everything" clears them', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  const sub = page.locator('header p').first()
  await folderRow(page, 'English 101').click()
  await folderRow(page, 'Biology').click({ modifiers: ['Shift'] })
  await expect(sub.getByRole('button', { name: /Remove filter/ })).toHaveCount(2)
  await expect(sub).toContainText('Biology')
  await sub.getByRole('button', { name: /Remove filter .*Biology/ }).click()
  await expect(sub).toContainText(/Everything\s*›\s*School\s*›\s*English 101/)
  await folderRow(page, 'Biology').click({ modifiers: ['Shift'] })
  await sub.getByRole('button', { name: 'Everything' }).click()
  await expect(sub).toHaveText(/^Filter: Everything$/)
})

test('the filter path: purple links, the current level a tag chip that slides back when you go up', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  const sub = page.locator('header p').first()
  await folderRow(page, 'English 101').click()
  await expect(sub).toContainText('English 101')
  // "Filter:" is bold serif; the links purple; the current step a soft tag chip in its group's colour
  expect(await sub.getByText('Filter:').evaluate((e) => getComputedStyle(e).fontWeight)).toBe('700')
  const link = sub.getByRole('button', { name: 'School' })
  expect(await link.evaluate((e) => getComputedStyle(e).color)).not.toBe(await sub.evaluate((e) => getComputedStyle(e).color))
  const pill = sub.locator('span[aria-hidden].absolute')
  await expect(pill).toHaveCount(1)
  const left = async () => (await pill.boundingBox())!.x
  const before = await left()
  await link.click()
  await page.waitForTimeout(80)
  const mid = await left()
  await page.waitForTimeout(700)
  const after = await left()
  expect(after).toBeLessThan(before - 20) // it moved back along the path...
  expect(Math.abs(mid - after)).toBeGreaterThan(0.5) // ...gliding (springily), not jumping straight there
  await expect(sub).toContainText(/Everything\s*›\s*School$/)
  await page.screenshot({ path: 'test-results/crumbs.png', clip: { x: 300, y: 40, width: 500, height: 50 } })
})

test('turned sideways: no "Filter:" word, and the globe stands for Everything', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => Object.defineProperty(window, 'orientation', { get: () => 90 }))
  const page = await ctx.newPage()
  await open(page)
  await folderRow(page, 'English 101').click()
  const rail = page.locator('header').first()
  await expect(rail).toContainText('English 101')
  await expect(rail.getByText('Filter:')).toHaveCount(0)
  const globe = rail.getByRole('button', { name: 'Everything' })
  await expect(globe).toBeVisible()
  await expect(globe.locator('svg')).toHaveCount(1)
  expect((await globe.innerText()).trim()).toBe('') // an icon, no word
  // the title is the size it is upright, and the filter line has its own run of the rail, stopping short of the buttons below
  expect(await rail.locator('h2').evaluate((e) => getComputedStyle(e).fontSize)).toBe('24px')
  const line = (await rail.locator('p').boundingBox())!
  const search = (await page.getByRole('button', { name: 'Search', exact: true }).boundingBox())!
  expect(line.y + line.height).toBeLessThanOrEqual(search.y)
  await ctx.close()
})
