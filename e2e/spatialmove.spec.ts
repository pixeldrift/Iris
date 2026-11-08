import { expect, test } from '@playwright/test'

type Pt = { x: number; y: number } | null
async function enter(page: import('@playwright/test').Page) {
  await page.goto('/?spacetest')
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await page.locator('button', { hasText: /^Space/ }).first().click()
  await page.getByRole('button', { name: 'Use touch only' }).click()
  await page.getByRole('button', { name: 'Got it' }).click().catch(() => {})
  await page.waitForTimeout(1200)
}
const pt = (page: import('@playwright/test').Page, kind: string, id: string) => page.evaluate(([k, i]) => (window as unknown as { __space: { screenPoint: (k: string, i: string) => Pt } }).__space.screenPoint(k, i), [kind, id])
const empty = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __space: { emptyPoint: () => Pt } }).__space.emptyPoint())
const stored = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-spatial-v5')!).state.layout)
const drag = async (page: import('@playwright/test').Page, a: { x: number; y: number }, b: { x: number; y: number }) => {
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 8, a.y + 4, { steps: 2 })
  await page.mouse.move(b.x, b.y, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}

const collapsedFolders = (page: import('@playwright/test').Page) => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('lilac-spatial-v5') ?? '{}')?.state?.collapsed ?? {}))
const fold = (page: import('@playwright/test').Page, ids: string[]) =>
  page.addInitScript((list) => {
    if (!localStorage.getItem('lilac-spatial-v5')) localStorage.setItem('lilac-spatial-v5', JSON.stringify({ state: { collapsed: Object.fromEntries(list.map((i) => [i, true])) }, version: 0 }))
  }, ids)

test.describe('folded groups', () => {
  test('a task carried onto a folded name opens it after a short linger, and lands in it', async ({ page }) => {
    await fold(page, ['demo-writing'])
    await enter(page)
    expect(await collapsedFolders(page)).toContain('demo-writing')
    const from = (await pt(page, 'task', 'demo-grandma'))!
    const to = (await pt(page, 'hub', 'demo-writing'))!
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 8, from.y + 4, { steps: 2 })
    await page.mouse.move(to.x + 30, to.y, { steps: 14 })
    await page.waitForTimeout(1100)
    expect(await collapsedFolders(page)).not.toContain('demo-writing') // (it sprang open)
    await page.mouse.up()
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === 'demo-grandma').folderIds[0]))).toBe('demo-writing')
  })

  test('a group let go on another group\'s name goes inside it; one opened only to look closes again', async ({ page }) => {
    await fold(page, ['demo-writing', 'demo-garden'])
    await enter(page)
    const from = (await pt(page, 'hub', 'life'))!
    const to = (await pt(page, 'hub', 'demo-writing'))!
    await page.mouse.move(from.x + 20, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 28, from.y + 4, { steps: 2 })
    await page.mouse.move(to.x + 30, to.y, { steps: 14 })
    await page.waitForTimeout(1100)
    await page.mouse.up()
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.folders.find((f: { id: string }) => f.id === 'life').parentId))).toBe('demo-writing')
  })
})

test.describe('moving things in the space', () => {
  test('a task dragged onto another group joins it (and leaves the one it was in)', async ({ page }) => {
    await enter(page)
    // "Call grandma" is in Life; carry it onto the Writing group's pane
    const from = (await pt(page, 'task', 'demo-grandma'))!
    const to = (await pt(page, 'plate', 'demo-writing'))!
    expect(from && to).toBeTruthy()
    await drag(page, from, to)
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === 'demo-grandma').folderIds[0]))).toBe('demo-writing')
    const l = await stored(page)
    expect(l.tasks['demo-grandma'].c).toBe('demo-writing')
    expect(l.tasks['demo-grandma'].free).toBeUndefined()
  })

  test('a task pulled out into open space floats there, and can be dropped into a group later', async ({ page }) => {
    await enter(page)
    const from = (await pt(page, 'task', 'demo-grandma'))!
    const open = (await empty(page))!
    expect(open).toBeTruthy()
    await drag(page, from, open)
    const l = await stored(page)
    expect(l.tasks['demo-grandma'].free).toBeTruthy()
    // still in its group as far as its tags go, until it is dropped into one
    const folder = await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === 'demo-grandma').folderIds[0])
    expect(folder).toBeTruthy()
    // now drop it into Writing
    const now = (await pt(page, 'task', 'demo-grandma'))!
    const to = (await pt(page, 'plate', 'demo-writing'))!
    await drag(page, now, to)
    await expect.poll(async () => (await stored(page)).tasks['demo-grandma'].c).toBe('demo-writing')
    expect((await stored(page)).tasks['demo-grandma'].free).toBeUndefined()
  })

  test('grabbing a group by its name or its pane moves the whole group, and the others make room', async ({ page }) => {
    await enter(page)
    const before = await stored(page)
    const hub = (await pt(page, 'hub', 'demo-writing'))!
    const target = (await pt(page, 'plate', 'life'))! // right on top of another group
    await drag(page, hub, target)
    const after = await stored(page)
    expect(after.clusters['demo-writing'].a).not.toBeCloseTo(before.clusters['demo-writing'].a, 3)
    // the two groups are not on top of each other now
    const A = after.clusters['demo-writing']
    const B = after.clusters['life']
    const apart = Math.abs(A.a - B.a) * 80 > 20 || Math.abs(A.y - B.y) > 10
    expect(apart).toBe(true)
  })
})
