import { expect, test } from '@playwright/test'
import { folderRow, goto, open } from './helpers'

const section = (page: import('@playwright/test').Page, name: string) => page.locator('[data-stage]').filter({ has: page.getByRole('heading', { name, exact: true }) })

test.describe('Progress view', () => {
  test('a long list pushes the boxes below it down, never expanding under them (stacked on a phone)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await open(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await goto(page, 'Progress')
    for (let i = 0; i < 12; i++) {
      await page.getByRole('button', { name: 'Add a task to Pending', exact: true }).click()
      await page.locator('[data-stage] input').fill(`Long list item ${i}`)
      await page.keyboard.press('Enter')
    }
    const boxes = await page.locator('[data-stage]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })))
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1)
    await ctx.close()
  })

  test.beforeEach(({ page }) => open(page))

  test('the + opens a box in the column, and Enter turns it into the new item at the top', async ({ page }) => {
    await goto(page, 'Progress')
    const pending = section(page, 'Pending')
    await expect(pending.getByRole('textbox')).toHaveCount(0) // (no box always sitting there)
    await pending.getByRole('button', { name: 'Add a task to Pending', exact: true }).click()
    await pending.getByRole('textbox').fill('Top of the list')
    await page.keyboard.press('Enter')
    await expect(pending.getByRole('textbox')).toHaveCount(0)
    await expect(pending.locator('[data-card-id]').first()).toContainText('Top of the list')
  })

  test('dropping on a column shows its border and a line where it lands, and puts it there (top by default)', async ({ page }) => {
    await goto(page, 'Progress')
    const doing = section(page, 'In Progress')
    const cards = doing.locator('[data-card-id]')
    const n = await cards.count()
    expect(n).toBeGreaterThan(2)
    const first = section(page, 'Pending').locator('[data-card-id]').first()
    const title = (await first.innerText()).split('\n')[0]
    const b = (await first.boundingBox())!
    // pick it up and carry it to between the second and third cards of In Progress
    const c2 = (await cards.nth(1).boundingBox())!
    const target = { x: c2.x + c2.width / 2, y: c2.y + c2.height + 4 }
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 20, { steps: 4 })
    await page.mouse.move(target.x, target.y, { steps: 12 })
    await expect(doing).toHaveClass(/outline-lilac-500/)
    expect(await doing.evaluate((e) => getComputedStyle(e).outlineWidth)).toBe('3px')
    await expect(page.locator('[data-slot-line]')).toHaveCount(1)
    await page.screenshot({ path: 'test-results/board-drag.png' })
    await page.mouse.up()
    await expect(doing.locator('[data-card-id]')).toHaveCount(n + 1)
    const order = await doing.locator('[data-card-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.split('\n')[0]))
    expect(order.indexOf(title)).toBe(2) // after the second card, where the line was
  })

  test('with no spot given (dropped on the heading), the item goes to the top', async ({ page }) => {
    await goto(page, 'Progress')
    const doing = section(page, 'In Progress')
    const first = section(page, 'Pending').locator('[data-card-id]').first()
    const title = (await first.innerText()).split('\n')[0]
    const b = (await first.boundingBox())!
    const h = (await doing.getByRole('heading', { name: 'In Progress' }).boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + 30, b.y + 30, { steps: 4 })
    await page.mouse.move(h.x + 20, h.y + h.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect(doing.locator('[data-card-id]').first()).toContainText(title)
  })

  test('the stage names along the top are links, and the editor has drag handles, a purple Add stage and Restore defaults', async ({ page }) => {
    await goto(page, 'Progress')
    await expect(page.getByRole('navigation', { name: 'Stages' }).getByRole('button')).toHaveCount(3)
    await expect(page.getByText('Open a group')).toHaveCount(0)
    await folderRow(page, 'English 101').click()
    await page.getByRole('button', { name: 'Edit stages' }).click()
    await expect(page.getByRole('button', { name: 'Move up' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Add stage' }).click()
    const names = () => page.getByLabel(/^Stage \d+ name$/).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
    expect(await names()).toEqual(['Pending', 'In Progress', 'New stage', 'Completed'])
    // carry "New stage" up above "Pending"
    const grip = (await page.getByRole('button', { name: 'Move New stage', exact: true }).boundingBox())!
    const top = (await page.getByLabel('Stage 1 name').boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + 4, top.y + 2, { steps: 8 })
    await page.mouse.up()
    expect((await names())[0]).toBe('New stage')
    await expect(page.getByText('tasks moved here are automatically checked off')).toBeVisible()
    // back to the defaults, after asking
    await page.getByRole('button', { name: 'Restore defaults' }).click()
    await page.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Restore defaults' })).toHaveCount(0)
  })
})

test.describe('list ordering', () => {
  test('carrying a row to a spot puts it there and the list follows "My order"', async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    const rows = page.locator('[data-lift-id^="task:"]')
    const titles = async () => rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.split('\n')[0].trim()))
    const before = await titles()
    const third = (await rows.nth(2).boundingBox())!
    const first = (await rows.nth(0).boundingBox())!
    // pick up the third row and carry it above the first
    await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2)
    await page.mouse.down()
    await page.mouse.move(third.x + third.width / 2 + 10, third.y + third.height / 2 - 10, { steps: 4 })
    await page.mouse.move(first.x + first.width / 2, first.y + 4, { steps: 10 })
    await expect(page.locator('[data-slot-line]')).toHaveCount(1)
    await page.mouse.up()
    await expect.poll(async () => (await titles())[0]).toBe(before[2])
    const after = await titles()
    expect(after.slice(1, 3)).toEqual([before[0], before[1]]) // the others keep their order, just shifted down
    await expect(page.getByRole('button', { name: /My order/ })).toBeVisible()
    // it stays that way
    await page.reload()
    await page.locator('aside nav button').first().waitFor()
    await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
    await goto(page, 'List')
    await expect.poll(async () => (await titles())[0]).toBe(before[2])
  })
})
