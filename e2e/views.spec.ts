import { expect, test } from '@playwright/test'
import { drag, folderRow, goto, open, saved, taskNamed } from './helpers'

test.describe('views', () => {
  test.use({ viewport: { width: 1300, height: 1000 } })

  test('every view opens without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await open(page)
    for (const v of ['List', 'Progress', 'Priority', 'Calendar', 'Timeline', 'Pond']) {
      await goto(page, v)
      await expect(page.locator('header h2')).toHaveText(v)
    }
    expect(errors).toEqual([])
  })

  test('list: Shift-click selects, the batch editor changes them together, sort order is Priority first', async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    // the sort menu leads with Priority
    await page.locator('button[aria-haspopup=menu]', { hasText: 'Priority' }).click()
    await expect(page.locator('div.fixed button').first()).toHaveText('Priority')
    await page.keyboard.press('Escape')
    const rows = page.locator('[data-lift-id^="task:"]')
    await rows.nth(0).click({ modifiers: ['Shift'] })
    await rows.nth(1).click({ modifiers: ['Shift'] })
    await expect(page.getByText('2 selected')).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.locator('label', { hasText: 'Progress' }).locator('input').check()
    await page.getByRole('button', { name: /Apply to 2 items/ }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const states = (await saved(page))!.tasks.filter((t) => t.status === 'doing').length
    expect(states).toBeGreaterThanOrEqual(2)
  })

  test('list: ticking a checklist moves it to In Progress, then Completed', async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    await page.locator('[data-lift-id^="task:"]', { hasText: 'Groceries' }).first().click()
    const boxes = page.getByRole('checkbox')
    const n = await boxes.count()
    expect((await taskNamed(page, 'Groceries'))?.status).toBe('todo')
    await boxes.first().click()
    await expect.poll(async () => (await taskNamed(page, 'Groceries'))?.status).toBe('doing')
    for (let i = 0; i < n; i++) if ((await boxes.nth(i).getAttribute('aria-checked')) === 'false') await boxes.nth(i).click()
    await expect.poll(async () => (await taskNamed(page, 'Groceries'))?.status).toBe('done')
  })

  test('progress: a group with its own stages shows them, and dragging a card moves it between them', async ({ page }) => {
    await open(page)
    await folderRow(page, 'Writing').click()
    await goto(page, 'Progress')
    for (const name of ['Research', 'First draft', 'Second draft', 'Editing', 'Submitted']) await expect(page.locator('section h3', { hasText: name })).toBeVisible()
    const card = page.locator('[data-lift-id^="task:"]', { hasText: 'Research the lighthouse setting' })
    const from = (await card.boundingBox())!
    const col = (await page.locator('section', { has: page.locator('h3', { hasText: 'Editing' }) }).boundingBox())!
    await drag(page, { x: from.x + 100, y: from.y + 20 }, { x: col.x + 100, y: col.y + 250 })
    await expect.poll(async () => (await taskNamed(page, 'Research the lighthouse setting'))?.stage).toBe('demo-editing')
  })

  test('progress: a column folds shut when its header is tapped', async ({ page }) => {
    await open(page)
    await goto(page, 'Progress')
    await page.locator('header[role=button]').first().click()
    await expect(page.locator('header[role=button][aria-expanded=false]')).toHaveCount(1)
  })

  test('priority: dragging a bubble shows its value on both axes and the labels take its colour', async ({ page }) => {
    await open(page)
    await goto(page, 'Priority')
    const b = (await page.locator('[data-node] [role=button]').first().boundingBox())!
    await drag(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width / 2 + 200, y: b.y + b.height / 2 - 60 }, { release: false })
    expect(await page.locator('[aria-hidden].rounded-full').count()).toBeGreaterThanOrEqual(2)
    await page.mouse.up()
    for (const label of ['Important', 'Unimportant', 'Urgent', 'Not urgent']) await expect(page.getByText(label, { exact: true })).toBeVisible()
  })

  test('timeline: zooming in reveals hours, and moving a bar there writes times', async ({ page }) => {
    await open(page)
    await goto(page, 'Timeline')
    for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(page.getByText(/^\d{1,2} (am|pm)$/).first()).toBeVisible()
    const bars = page.locator('div.cursor-grab')
    let box = null
    for (const bar of await bars.all()) {
      const q = await bar.boundingBox()
      if (q && q.x > 420 && q.x + 260 < 1280 && q.width > 200) { box = q; break }
    }
    expect(box).not.toBeNull()
    await drag(page, { x: box!.x + 80, y: box!.y + box!.height / 2 }, { x: box!.x + 210, y: box!.y + box!.height / 2 }, { steps: 6 })
    await expect.poll(async () => (await saved(page))!.tasks.filter((t) => t.time && t.endTime && t.start).length).toBeGreaterThan(0)
  })
})
