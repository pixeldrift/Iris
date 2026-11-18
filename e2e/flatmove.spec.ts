import { expect, test } from '@playwright/test'

type P = import('@playwright/test').Page
async function enterFlat(page: P) {
  await page.goto('/?spacetest')
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await page.locator('button', { hasText: /^Spatial/ }).first().click()
  await page.getByRole('button', { name: 'Got it' }).click({ timeout: 1500 }).catch(() => {})
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
    const from = await centre(page, '[data-task="demo-grandma"] button.truncate')
    const to = await centre(page, '[data-box="demo-writing"]')
    await drag(page, from, to)
    await expect.poll(() => folderOf(page, 'demo-grandma')).toBe('demo-writing')
    expect((await stored(page)).tasks['demo-grandma'].c).toBe('demo-writing')
    // a plain tap on a title still opens it, and a drag did not
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('a task pulled out into the open floats there, and can be dropped into a group later', async ({ page }) => {
    await enterFlat(page)
    const from = await centre(page, '[data-task="demo-grandma"] button.truncate')
    const canvas = (await page.locator('[aria-label^="Your tasks by group"]').boundingBox())!
    await drag(page, from, { x: canvas.x + 70, y: canvas.y + 60 })
    expect((await stored(page)).tasks['demo-grandma'].free).toBeTruthy()
    // left there, in no group
    await expect.poll(() => folderOf(page, 'demo-grandma')).toBeFalsy()
    expect((await stored(page)).tasks['demo-grandma'].c).toBe('none')
    const f = await centre(page, '[data-task="demo-grandma"] button.truncate')
    await drag(page, f, await centre(page, '[data-box="demo-writing"]'))
    await expect.poll(() => folderOf(page, 'demo-grandma')).toBe('demo-writing')
    expect((await stored(page)).tasks['demo-grandma'].free).toBeUndefined()
  })

  test('a tap on empty canvas opens the new-item box, and what is made is left there in no group', async ({ page }) => {
    await enterFlat(page)
    const canvas = (await page.locator('[aria-label^="Your tasks by group"]').boundingBox())!
    await page.mouse.click(canvas.x + 70, canvas.y + 60)
    await page.getByLabel('New item').first().fill('Flat tap')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { title: string }) => t.title === 'Flat tap')?.folderIds))).toEqual([])
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { title: string }) => t.title === 'Flat tap').id)
    expect((await stored(page)).tasks[id].free).toBeTruthy()
  })

  test('a task carried onto a folded name opens it after a short linger, and lands in it', async ({ page }) => {
    await fold(page, ['demo-writing'])
    await enterFlat(page)
    const from = await centre(page, '[data-task="demo-grandma"] button.truncate')
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
    const gx = box!.x + box!.width / 2 // (the strip under the last row of cards, clear of the rounded corners)
    const gy = box!.y + box!.height - 2
    await drag(page, { x: gx, y: gy }, { x: gx + 120, y: gy + 40 })
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
    await drag(page, await centre(page, '[data-task="demo-grandma"] button.truncate'), await row('garden'))
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === 'demo-grandma').folderIds.includes('garden'))).toBe(true)
    await drag(page, await centre(page, '[data-hub="life"]', 40), await row('home'))
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.folders.find((f: { id: string }) => f.id === 'life').parentId)).toBe('home')
  })
})

test('a tap on blank space inside a group box opens the new-item box with that group on it', async ({ page }) => {
  await enterFlat(page)
  const b = (await page.locator('[data-box="eng101"]').boundingBox())!
  // the bottom-right of the box: the third row has an empty slot there
  await page.mouse.click(b.x + b.width * 0.75, b.y + b.height - 22) // (clear of the corner dots)
  await page.getByLabel('New item').first().fill('Flat blank tap')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { title: string }) => t.title === 'Flat blank tap')?.folderIds ?? [])).toContain('eng101')
})

test('flat: a card let go in a box settles into a slot, not on top of another card', async ({ page }) => {
  await enterFlat(page)
  const box = (await page.locator('[data-box="life"]').boundingBox())!
  await drag(page, await centre(page, '[data-task="demo-grandma"] button.truncate'), { x: box.x + box.width - 30, y: box.y + box.height - 20 })
  const l = await stored(page)
  const slots = Object.values(l.tasks as Record<string, { c: string; slot: number; free?: unknown }>).filter((x) => x.c === 'life' && !x.free).map((x) => x.slot)
  expect(new Set(slots).size).toBe(slots.length)
})

test.describe('a group can be made bigger or smaller by its corner dots', () => {
  const grip = (page: P, id: string, edge: 'left' | 'right') => centre(page, `[data-resize="${id}"][data-edge="${edge}"]`)
  const cell = async (page: P) => {
    // one column of the group, in screen pixels: the distance between two cards side by side
    const a = await page.locator('[data-box="life"] [data-task]').nth(0).boundingBox()
    const b = await page.locator('[data-box="life"] [data-task]').nth(1).boundingBox()
    return Math.abs(b!.x - a!.x) || 220
  }

  test('dragging the right dot a column wider adds a column, keeps every card, and shows faint empty slots while it is dragged', async ({ page }) => {
    await enterFlat(page)
    const before = (await stored(page)).clusters.life
    const start = await grip(page, 'life', 'right')
    const step = await cell(page)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 10, start.y + 2, { steps: 2 })
    await page.mouse.move(start.x + step * 1.05, start.y + 2, { steps: 12 })
    await page.waitForTimeout(500)
    // the empty slots of the size it is heading for show faintly while the dot is held
    const faint = page.locator('[data-box="life"] .border-dashed')
    await expect.poll(() => faint.count()).toBeGreaterThan(0)
    await page.mouse.up()
    await expect.poll(async () => (await stored(page)).clusters.life.cols).toBe(before.cols + 1)
    // ... and they fade away once it is let go
    await expect(faint).toHaveCount(0, { timeout: 4000 })
    const after = await stored(page)
    const slots = Object.values(after.tasks as Record<string, { c: string; slot: number }>).filter((t) => t.c === 'life').map((t) => t.slot)
    expect(new Set(slots).size).toBe(slots.length)
  })

  test('the left dot grows it to the left, and the size cannot go below what the cards need', async ({ page }) => {
    await enterFlat(page)
    const before = (await stored(page)).clusters.life
    const box0 = (await page.locator('[data-box="life"]').boundingBox())!
    const g = await grip(page, 'life', 'left')
    const step = await cell(page)
    await drag(page, g, { x: g.x - step, y: g.y }, 200)
    await expect.poll(async () => (await stored(page)).clusters.life.cols).toBe(before.cols + 1)
    await page.waitForTimeout(800)
    const box1 = (await page.locator('[data-box="life"]').boundingBox())!
    expect(box1.x + box1.width).toBeCloseTo(box0.x + box0.width, -1) // (its right edge stayed put)
    expect(box1.x).toBeLessThan(box0.x - 20)
    // drag the right dot far inward: the cards stop it (six cards need at least two columns of three rows)
    const r = await grip(page, 'life', 'right')
    await drag(page, r, { x: r.x - step * 4, y: r.y - 400 }, 200)
    const small = (await stored(page)).clusters.life
    expect(small.cols).toBeGreaterThanOrEqual(1)
    const slots = Object.values((await stored(page)).tasks as Record<string, { c: string; slot: number }>).filter((t) => t.c === 'life')
    expect(Math.max(...slots.map((t) => t.slot))).toBeLessThan(small.cols * (small.rows ?? 1))
  })
})

test.describe('what the flat canvas shows at its edges, and a tap that only closes a menu', () => {
  test('small dots at the edge point to groups out of view; the setting for the flat view is its own', async ({ page }) => {
    await enterFlat(page)
    const c = (await page.getByRole('region', { name: 'Spatial workspace' }).boundingBox())!
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
    await page.mouse.wheel(0, -900) // (in: the groups at the sides leave the screen)
    await page.waitForTimeout(500)
    const dots = page.locator('.edge-dot')
    await expect.poll(() => dots.count()).toBeGreaterThan(0)
    const box = (await dots.first().boundingBox())!
    expect(box.width).toBeLessThan(14) // (small: only a hint)
    // switched off for the flat view: gone, and the 3D view's own choice is untouched
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    await page.getByRole('checkbox', { name: /Indicate off-screen tasks/ }).uncheck()
    await expect(dots).toHaveCount(0)
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-spatial-v5')!).state)
    expect(st.edgeDots2d).toBe(false)
    expect(st.edgeDots3d).not.toBe(false)
  })

  test('loose cards have a gap between them like the cards in a group', async ({ page }) => {
    await enterFlat(page)
    const loose = page.locator('[data-task]').filter({ hasNot: page.locator('xpath=ancestor::*[@data-box]') })
    const boxes: { x: number; y: number; width: number; height: number }[] = []
    for (const id of ['demo-plumber', 'demo-rent', 'demo-books']) {
      const b = await page.locator(`[data-task="${id}"]`).boundingBox()
      if (b) boxes.push(b)
    }
    void loose
    boxes.sort((a, b) => a.x - b.x)
    for (let i = 1; i < boxes.length; i++) if (Math.abs(boxes[i].y - boxes[i - 1].y) < 20) expect(boxes[i].x - (boxes[i - 1].x + boxes[i - 1].width)).toBeGreaterThan(1)
  })

  test('a tap on the canvas while the settings menu is open only closes it', async ({ page }) => {
    await enterFlat(page)
    const count = async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.length)) as number
    const before = await count()
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    await expect(page.locator('[data-popover]')).toBeVisible()
    const r = (await page.getByRole('region', { name: 'Spatial workspace' }).boundingBox())!
    await page.mouse.click(r.x + r.width * 0.12, r.y + r.height * 0.82) // (empty canvas)
    await expect(page.locator('[data-popover]')).toHaveCount(0)
    await page.waitForTimeout(600)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await count()).toBe(before)
    // and a tap with nothing open still opens the box for a new one
    await page.mouse.click(r.x + r.width * 0.12, r.y + r.height * 0.82)
    await expect(page.getByLabel('New item').first()).toBeVisible()
  })
})

test.describe('moving around the flat canvas', () => {
  test.use({ hasTouch: true })
  const view = (page: P) => page.locator('[aria-label^="Your tasks by group"] > div.absolute.left-0.top-0').first().evaluate((el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return { k: m.a, x: m.e, y: m.f } })
  const touch = async (page: P, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) => {
    const cdp = (touch as unknown as { cdp?: import('@playwright/test').CDPSession }).cdp ?? (await page.context().newCDPSession(page))
    ;(touch as unknown as { cdp?: unknown }).cdp = cdp
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) })
  }

  test('after a corner dot has been dragged with a finger, a drag on the canvas still pans it (it does not zoom)', async ({ page }) => {
    await enterFlat(page)
    const g = await centre(page, '[data-resize="life"][data-edge="right"]')
    // (a finger: each touch is a pointer of its own, so one left counted as down would make the next drag look like a pinch)
    await touch(page, 'touchStart', [g])
    for (let i = 1; i <= 8; i++) await touch(page, 'touchMove', [{ x: g.x + i * 8, y: g.y + i * 3 }])
    await touch(page, 'touchEnd', [])
    await page.waitForTimeout(900)
    const before = await view(page)
    const c = (await page.getByRole('region', { name: 'Spatial workspace' }).boundingBox())!
    const p = { x: c.x + 60, y: c.y + c.height - 90 }
    await touch(page, 'touchStart', [p])
    for (let i = 1; i <= 8; i++) await touch(page, 'touchMove', [{ x: p.x + i * 12, y: p.y + i * 4 }])
    await touch(page, 'touchEnd', [])
    const after = await view(page)
    expect(after.k).toBeCloseTo(before.k, 3)
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(40)
  })

  test('two fingers move the canvas wherever they land (even on cards), and pinch zooms it', async ({ page }) => {
    await enterFlat(page)
    const a = await centre(page, '[data-task="demo-grandma"] button.truncate') // (on a card)
    const b = { x: a.x + 120, y: a.y + 10 } // (the other on a neighbouring card or the box)
    const v0 = await view(page)
    await touch(page, 'touchStart', [a, b])
    for (let i = 1; i <= 8; i++) await touch(page, 'touchMove', [{ x: a.x + i * 10, y: a.y + i * 5 }, { x: b.x + i * 10, y: b.y + i * 5 }])
    await touch(page, 'touchEnd', [])
    const v1 = await view(page)
    expect(v1.k).toBeCloseTo(v0.k, 2)
    expect(v1.x - v0.x).toBeGreaterThan(50)
    expect(v1.y - v0.y).toBeGreaterThan(25)
    // spread apart: it zooms in
    const c = { x: a.x, y: a.y + 120 }
    await touch(page, 'touchStart', [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }])
    for (let i = 1; i <= 8; i++) await touch(page, 'touchMove', [{ x: c.x - 40 - i * 15, y: c.y }, { x: c.x + 40 + i * 15, y: c.y }])
    await touch(page, 'touchEnd', [])
    expect((await view(page)).k).toBeGreaterThan(v1.k * 1.5)
    // and one finger still drags afterwards
    const v2 = await view(page)
    const p = { x: c.x, y: c.y + 100 }
    await touch(page, 'touchStart', [p])
    for (let i = 1; i <= 6; i++) await touch(page, 'touchMove', [{ x: p.x + i * 12, y: p.y }])
    await touch(page, 'touchEnd', [])
    const v3 = await view(page)
    expect(v3.k).toBeCloseTo(v2.k, 2)
    expect(v3.x - v2.x).toBeGreaterThan(40)
  })
})
