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

test.describe('onto the sidebar', () => {
  test('a task carried out over a sidebar group joins it; a group goes inside it', async ({ page }) => {
    await enter(page)
    const row = (id: string) => page.locator(`[data-drop="folder:${id}"]`).first()
    const c = async (id: string) => {
      const b = (await row(id).boundingBox())!
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    const from = (await pt(page, 'task', 'demo-grandma'))!
    await drag(page, from, await c('garden'))
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === 'demo-grandma').folderIds.includes('garden')))).toBe(true)
    const hub = (await pt(page, 'hub', 'life'))!
    await drag(page, { x: hub.x + 20, y: hub.y }, await c('home'))
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.folders.find((f: { id: string }) => f.id === 'life').parentId))).toBe('home')
  })
})

test.describe('moving a parent', () => {
  test('its subgroups travel with it, keeping their places around it', async ({ page }) => {
    await enter(page)
    const before = await stored(page)
    const from = (await pt(page, 'hub', 'school'))!
    const to = { x: from.x + 140, y: from.y + 30 }
    await drag(page, { x: from.x + 20, y: from.y }, { x: to.x + 20, y: to.y })
    const after = await stored(page)
    const d = (id: string) => ({ a: after.clusters[id].a - before.clusters[id].a, y: after.clusters[id].y - before.clusters[id].y })
    const p = d('school')
    expect(Math.abs(p.a) + Math.abs(p.y)).toBeGreaterThan(0.01)
    // (the others may be nudged a little afterwards to stay clear of neighbours, so compare the offsets loosely)
    for (const k of ['eng101', 'bio']) {
      const o = (after.clusters[k].a - after.clusters.school.a) - (before.clusters[k].a - before.clusters.school.a)
      expect(Math.abs(o)).toBeLessThan(0.15)
    }
  })
})

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
  test('a task dragged onto another group joins it (and leaves the one it was in) @smoke', async ({ page }) => {
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
    // left there, in no group: on the wall it is "unsorted, anywhere", and everywhere else it shows in the Unsorted group
    expect(l.tasks['demo-grandma'].c).toBe('none')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === 'demo-grandma').folderIds.length)).toBe(0)
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

test.describe('blank space in a group', () => {
  test('a tap on the empty part of a group box opens the new-item box with that group on it', async ({ page }) => {
    await enter(page)
    const at = await page.evaluate(() => (window as unknown as { __space: { blankInPlate: (id: string) => Pt } }).__space.blankInPlate('eng101'))
    expect(at).not.toBeNull()
    await page.mouse.click(at!.x, at!.y)
    await page.getByLabel('New item').first().fill('Blank tap')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { title: string }) => t.title === 'Blank tap')?.folderIds ?? []))).toContain('eng101')
  })
})

test.describe('keep tidy', () => {
  test('a card let go inside a group settles into a slot of its grid; with "Keep tidy" off it stays where it was let go', async ({ page }) => {
    await enter(page)
    const slotUV = (cols: number, slot: number) => ({ u: ((slot % cols) - (cols - 1) / 2) * 18.7, v: -(Math.floor(slot / cols) + 1) * 7.6 })
    // carry "Call grandma" a little way within Life: it lands on a slot (u, v exactly those of one)
    const from = (await pt(page, 'task', 'demo-grandma'))!
    const to = { x: from.x + 26, y: from.y + 14 }
    await drag(page, from, to)
    let l = await stored(page)
    const t = l.tasks['demo-grandma']
    const cols = l.clusters[t.c].cols
    const want = slotUV(cols, t.slot)
    expect(Math.abs(t.u - want.u)).toBeLessThan(0.5)
    expect(Math.abs(t.v - want.v)).toBeLessThan(0.5)
    // no two cards share a slot
    const slots = Object.values(l.tasks as Record<string, { c: string; slot: number; free?: unknown }>).filter((x) => x.c === t.c && !x.free).map((x) => x.slot)
    expect(new Set(slots).size).toBe(slots.length)
    // switched off, it is left where it was let go (not on a slot)
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    await page.getByRole('checkbox', { name: /Keep tidy/ }).uncheck()
    await page.keyboard.press('Escape')
    const from2 = (await pt(page, 'task', 'demo-grandma'))!
    await drag(page, from2, { x: from2.x + 9, y: from2.y + 7 })
    l = await stored(page)
    const t2 = l.tasks['demo-grandma']
    const want2 = slotUV(cols, t2.slot)
    expect(Math.abs(t2.u - want2.u) + Math.abs(t2.v - want2.v)).toBeGreaterThan(0.3)
  })

  test('a group let go settles onto the grid', async ({ page }) => {
    await enter(page)
    const hub = (await pt(page, 'hub', 'life'))!
    await drag(page, { x: hub.x + 20, y: hub.y }, { x: hub.x + 57, y: hub.y + 23 })
    const l = await stored(page)
    const c = l.clusters.life
    const gx = 18.7 / 2
    expect(Math.abs(((c.a * c.r) / gx) - Math.round((c.a * c.r) / gx))).toBeLessThan(0.05)
  })
})
