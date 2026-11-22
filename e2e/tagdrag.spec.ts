import { expect, test } from '@playwright/test'
import { goto, open, saved, taskNamed } from './helpers'

test.use({ viewport: { width: 1300, height: 900 } })

/** Give a task two groups and open its details, with the list view beside it. */
async function setUp(page: import('@playwright/test').Page) {
  await open(page)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    const t = raw.state.tasks.find((x: { title: string }) => x.title === 'Study group')
    t.folderIds = ['life', 'demo-writing']
    t.tagOrder = ['life', 'demo-writing']
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await goto(page, 'List')
  await page.getByText('Study group', { exact: true }).first().click()
  await page.getByLabel('Task details').waitFor()
  await page.waitForTimeout(700)
  await page.locator('[data-tag-chip]').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
}
const centre = async (loc: import('@playwright/test').Locator) => {
  const b = (await loc.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test.describe('tags in the task details', () => {
  test('a tag is dragged to a new place in the box, and the order is kept', async ({ page }) => {
    await setUp(page)
    const chips = page.locator('[data-tag-chip]')
    await expect(chips).toHaveCount(2)
    const first = await centre(chips.nth(0))
    const second = await centre(chips.nth(1))
    const firstBox = (await chips.nth(0).boundingBox())!
    const before = await chips.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tagChip))
    await page.mouse.move(second.x - 6, second.y)
    await page.mouse.down()
    await page.mouse.move(second.x - 20, second.y + 2, { steps: 4 })
    await page.mouse.move(firstBox.x + 3, first.y, { steps: 8 }) // (the left end of the first tag: in front of it)
    // the tags hold still while one is carried: a line shows where it would land, and it goes in front of the first
    await expect(page.locator('[data-tag-marker]')).toHaveCount(1)
    await expect(chips.nth(0)).toHaveAttribute('data-tag-chip', /.+/)
    expect(await chips.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tagChip))).toEqual(before)
    await page.mouse.up()
    await expect.poll(async () => (await taskNamed(page, 'Study group'))?.tagOrder?.[0]).toBe('demo-writing')
    // the groups themselves are untouched
    // the groups themselves are untouched, and the main colour is still that of the group it was given first (Life)
    expect((await taskNamed(page, 'Study group'))!.folderIds).toEqual(['life', 'demo-writing'])
  })

  test('a tag dragged out of the box and onto another task tags that task, and the original keeps it', async ({ page }) => {
    await setUp(page)
    const chip = page.locator('[data-tag-chip="demo-writing"]')
    const from = await centre(chip)
    const row = page.locator('[data-lift-id^="task:"]').filter({ hasText: 'Pay rent' }).first()
    const to = await centre(row)
    await page.mouse.move(from.x - 8, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 20, from.y - 30, { steps: 4 })
    await page.mouse.move(to.x, to.y, { steps: 14 })
    // while it is over a task: the original stays (dashed) and the task is ringed
    await expect(chip).toBeVisible()
    await expect(page.locator('.tag-over')).toHaveCount(1)
    await page.mouse.up()
    await expect.poll(async () => (await taskNamed(page, 'Pay rent'))?.folderIds ?? []).toContain('demo-writing')
    expect((await taskNamed(page, 'Study group'))!.folderIds).toContain('demo-writing') // (only a copy was carried)
    await expect(page.locator('.tag-badge')).toBeVisible()
    await expect(page.getByText(/Tagged .Pay rent. with Writing/)).toBeVisible()
  })

  test('a task that already has a group keeps it as its main one when another is dropped on it', async ({ page }) => {
    await setUp(page)
    const from = await centre(page.locator('[data-tag-chip="demo-writing"]'))
    const row = page.locator('[data-lift-id^="task:"]').filter({ hasText: 'Call grandma' }).first()
    const to = await centre(row)
    await page.mouse.move(from.x - 8, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 20, from.y - 30, { steps: 4 })
    await page.mouse.move(to.x, to.y, { steps: 14 })
    await page.mouse.up()
    await expect.poll(async () => (await taskNamed(page, 'Call grandma'))?.folderIds ?? []).toEqual(['life', 'demo-writing'])
  })

  test('letting a torn-off tag go over nothing leaves everything as it was', async ({ page }) => {
    await setUp(page)
    const chip = page.locator('[data-tag-chip="demo-writing"]')
    const from = await centre(chip)
    const before = JSON.stringify((await saved(page))!.tasks.map((t) => [t.id, t.folderIds]))
    await page.mouse.move(from.x - 8, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 30, from.y - 40, { steps: 5 })
    await page.mouse.move(60, 700, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    expect(JSON.stringify((await saved(page))!.tasks.map((t) => [t.id, t.folderIds]))).toBe(before)
  })
})

test.describe('reordering the entries of a list', () => {
  async function listTask(page: import('@playwright/test').Page) {
    await open(page)
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
      const t = raw.state.tasks.find((x: { title: string }) => x.title === 'Groceries')
      t.kind = 'list'
      t.items = ['Milk', 'Bread', 'Eggs'].map((text, i) => ({ id: `i${i}`, text, done: false }))
      localStorage.setItem('lilac-v1', JSON.stringify(raw))
    })
    await page.reload()
    await page.locator('[data-node]').first().waitFor()
    await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
    await goto(page, 'List')
    await page.getByText('Groceries', { exact: true }).first().click()
    await page.getByLabel('Task details').waitFor()
    await page.waitForTimeout(600)
    await page.locator('[data-item-grip]').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
  }

  test('a grip on each entry moves it, and it sits well apart from the delete button', async ({ page }) => {
    await listTask(page)
    const grips = page.locator('[data-item-grip]')
    await expect(grips).toHaveCount(3)
    // the grip and the delete button of an entry are not close enough to be hit by mistake
    const g = (await grips.first().boundingBox())!
    const x = (await page.getByRole('button', { name: 'Remove Milk' }).boundingBox())!
    expect(x.x - (g.x + g.width)).toBeGreaterThanOrEqual(10)
    const from = await centre(grips.first())
    const to = await centre(grips.nth(2))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y + 10, { steps: 3 })
    await page.mouse.move(to.x, to.y + 14, { steps: 10 })
    await page.mouse.up()
    await expect.poll(async () => ((await taskNamed(page, 'Groceries'))?.items ?? []).map((i: { text: string }) => i.text)).toEqual(['Bread', 'Eggs', 'Milk'])
  })

  test('the arrow keys move an entry from its grip', async ({ page }) => {
    await listTask(page)
    await page.locator('[data-item-grip="i2"]').focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(async () => ((await taskNamed(page, 'Groceries'))?.items ?? []).map((i: { text: string }) => i.text)).toEqual(['Milk', 'Eggs', 'Bread'])
  })

  test('the style toggle sits at the left with no label, and an entry can be nested by dragging sideways or with the arrow keys', async ({ page }) => {
    await listTask(page)
    await expect(page.getByText('Marked with', { exact: true })).toHaveCount(0)
    const toggle = (await page.getByRole('radiogroup', { name: 'Marked with' }).boundingBox())!
    const first = (await page.locator('li[data-reorder-row]').first().boundingBox())!
    expect(Math.abs(toggle.x - first.x)).toBeLessThan(12)
    const depths = async () => ((await taskNamed(page, 'Groceries'))?.items ?? []).map((i: { depth?: number }) => i.depth ?? 0)
    await page.locator('[data-item-grip]').nth(1).focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(depths).toEqual([0, 1, 0])
    await page.keyboard.press('ArrowLeft')
    await expect.poll(depths).toEqual([0, 0, 0])
    // dragged out to the right, under the row above
    const g = await centre(page.locator('[data-item-grip]').nth(2))
    await page.mouse.move(g.x, g.y)
    await page.mouse.down()
    await page.mouse.move(g.x + 6, g.y + 2, { steps: 2 })
    await page.mouse.move(g.x + 40, g.y + 2, { steps: 8 })
    await page.mouse.up()
    await expect.poll(depths).toEqual([0, 0, 1])
    await expect(page.locator('li[data-reorder-row]').nth(2)).toHaveCSS('margin-left', '24px')
  })

  test('"Checked last" puts ticked entries at the bottom', async ({ page }) => {
    await listTask(page)
    await page.getByRole('button', { name: 'Checked last' }).click()
    await page.getByRole('checkbox', { name: 'Completed: Milk' }).click()
    await expect.poll(async () => ((await taskNamed(page, 'Groceries'))?.items ?? []).map((i: { text: string }) => i.text)).toEqual(['Bread', 'Eggs', 'Milk'])
  })
})

test.describe('where the tags are in the details', () => {
  test('they have a box of their own that names them even when it is folded, and is not hidden in a folded Who box', async ({ page }) => {
    await setUp(page)
    // fold Who the way a person might have: the tags must still be there
    const who = page.getByRole('region', { name: 'Who' })
    if ((await who.getByRole('button', { name: /^Who/ }).getAttribute('aria-expanded')) === 'true') await who.getByRole('button', { name: /^Who/ }).click()
    const tags = page.getByRole('region', { name: 'Tags' })
    await expect(tags).toBeVisible()
    await expect(page.locator('[data-tag-chip]')).toHaveCount(2)
    // folded, it still says what is in it
    await tags.getByRole('button', { name: /^Tags/ }).click()
    await expect(tags).toContainText('Life, Writing')
    await expect(page.locator('[data-tag-chip]')).toHaveCount(0)
  })
})
