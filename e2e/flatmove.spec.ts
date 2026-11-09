import { expect, test } from '@playwright/test'

type P = import('@playwright/test').Page
async function enterFlat(page: P) {
  await page.goto('/?spacetest')
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await page.locator('button', { hasText: /^Space/ }).first().click()
  await page.getByRole('button', { name: 'Use touch only' }).click()
  await page.getByRole('button', { name: 'Got it' }).click().catch(() => {})
  await page.getByRole('radio', { name: 'Flat' }).click()
  await page.locator('[data-hub]').first().waitFor()
  await page.waitForTimeout(400)
}
const centre = async (page: P, sel: string, dx = 0) => {
  const b = (await page.locator(sel).first().boundingBox())!
  return { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 }
}
const stored = (page: P) => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-spatial-v5')!).state.layout)
const folderOf = (page: P, id: string) => page.evaluate((i) => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === i).folderIds[0], id)
const drag = async (page: P, a: { x: number; y: number }, b: { x: number; y: number }, hold = 0) => {
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 8, a.y + 4, { steps: 2 })
  await page.mouse.move(b.x, b.y, { steps: 14 })
  if (hold) await page.waitForTimeout(hold)
  await page.mouse.up()
  await page.waitForTimeout(400)
}
const fold = (page: P, ids: string[]) =>
  page.addInitScript((list) => {
    if (!localStorage.getItem('lilac-spatial-v5')) localStorage.setItem('lilac-spatial-v5', JSON.stringify({ state: { collapsed: Object.fromEntries(list.map((i) => [i, true])) }, version: 0 }))
  }, ids)

test.describe('the flat canvas does everything the 3D space does', () => {
  test('a task dragged onto another group joins it @smoke', async ({ page }) => {
    await enterFlat(page)
    const from = await centre(page, '[data-task="demo-grandma"] button:nth-child(2)')
    const to = await centre(page, '[data-box="demo-writing"]')
    await drag(page, from, to)
    await expect.poll(() => folderOf(page, 'demo-grandma')).toBe('demo-writing')
    expect((await stored(page)).tasks['demo-grandma'].c).toBe('demo-writing')
    // a plain tap on a title still opens it, and a drag did not
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('a task pulled out into the open floats there, and can be dropped into a group later', async ({ page }) => {
    await enterFlat(page)
    const from = await centre(page, '[data-task="demo-grandma"] button:nth-child(2)')
    const canvas = (await page.locator('[aria-label^="Your tasks by group"]').boundingBox())!
    await drag(page, from, { x: canvas.x + 70, y: canvas.y + 60 })
    expect((await stored(page)).tasks['demo-grandma'].free).toBeTruthy()
    const was = await folderOf(page, 'demo-grandma')
    expect(was).toBeTruthy()
    const f = await centre(page, '[data-task="demo-grandma"] button:nth-child(2)')
    await drag(page, f, await centre(page, '[data-box="demo-writing"]'))
    await expect.poll(() => folderOf(page, 'demo-grandma')).toBe('demo-writing')
    expect((await stored(page)).tasks['demo-grandma'].free).toBeUndefined()
  })

  test('a task carried onto a folded name opens it after a short linger, and lands in it', async ({ page }) => {
    await fold(page, ['demo-writing'])
    await enterFlat(page)
    const from = await centre(page, '[data-task="demo-grandma"] button:nth-child(2)')
    await drag(page, from, await centre(page, '[data-hub="demo-writing"]', 20), 1100)
    await expect.poll(() => folderOf(page, 'demo-grandma')).toBe('demo-writing')
    const open = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('lilac-spatial-v5')!).state.collapsed))
    expect(open).not.toContain('demo-writing') // (it was dropped into, so it stays open)
  })

  test('a group let go on another group\'s name goes inside it', async ({ page }) => {
    await enterFlat(page)
    await drag(page, await centre(page, '[data-hub="life"]', 40), await centre(page, '[data-hub="demo-writing"]', 40))
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.folders.find((f: { id: string }) => f.id === 'life').parentId)).toBe('demo-writing')
  })

  test('a group dragged by its box moves, and the twirl still folds it', async ({ page }) => {
    await enterFlat(page)
    const before = (await stored(page)).clusters.life
    const box = await page.locator('[data-box="life"]').boundingBox()
    await drag(page, { x: box!.x + 8, y: box!.y + box!.height - 6 }, { x: box!.x + 8 + 120, y: box!.y + box!.height - 6 + 40 })
    const after = (await stored(page)).clusters.life
    expect(Math.abs(after.a - before.a) + Math.abs(after.y - before.y)).toBeGreaterThan(0.01)
    await page.getByRole('button', { name: 'Fold Life' }).click()
    await expect(page.locator('[data-box="life"]')).toBeHidden()
  })

  test('a parent dragged by its name takes its subgroups with it', async ({ page }) => {
    await enterFlat(page)
    const before = await stored(page)
    await drag(page, await centre(page, '[data-hub="school"]', 40), { x: (await centre(page, '[data-hub="school"]', 40)).x + 120, y: (await centre(page, '[data-hub="school"]')).y + 20 })
    const after = await stored(page)
    const off = (c: { clusters: Record<string, { a: number }> }, k: string) => c.clusters[k].a - c.clusters.school.a
    expect(Math.abs(after.clusters.school.a - before.clusters.school.a)).toBeGreaterThan(0.01)
    for (const k of ['eng101', 'bio']) expect(Math.abs(off(after, k) - off(before, k))).toBeLessThan(0.15)
  })

  test('a task or group carried out over a sidebar group is dropped there', async ({ page }) => {
    await enterFlat(page)
    const row = async (id: string) => {
      const b = (await page.locator(`[data-drop="folder:${id}"]`).first().boundingBox())!
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    await drag(page, await centre(page, '[data-task="demo-grandma"] button:nth-child(2)'), await row('garden'))
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === 'demo-grandma').folderIds.includes('garden'))).toBe(true)
    await drag(page, await centre(page, '[data-hub="life"]', 40), await row('home'))
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.folders.find((f: { id: string }) => f.id === 'life').parentId)).toBe('home')
  })
})

test('a tap on blank space inside a group box opens the new-item box with that group on it', async ({ page }) => {
  await enterFlat(page)
  const b = (await page.locator('[data-box="eng101"]').boundingBox())!
  // the bottom-right of the box: the third row has an empty slot there
  await page.mouse.click(b.x + b.width - 14, b.y + b.height - 12)
  await page.getByLabel('New item').first().fill('Flat blank tap')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { title: string }) => t.title === 'Flat blank tap')?.folderIds ?? [])).toContain('eng101')
})

test('flat: a card let go in a box settles into a slot, not on top of another card', async ({ page }) => {
  await enterFlat(page)
  const box = (await page.locator('[data-box="life"]').boundingBox())!
  await drag(page, await centre(page, '[data-task="demo-grandma"] button:nth-child(2)'), { x: box.x + box.width - 30, y: box.y + box.height - 20 })
  const l = await stored(page)
  const slots = Object.values(l.tasks as Record<string, { c: string; slot: number; free?: unknown }>).filter((x) => x.c === 'life' && !x.free).map((x) => x.slot)
  expect(new Set(slots).size).toBe(slots.length)
})
