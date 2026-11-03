import { expect, test } from '@playwright/test'
import { goto, open, saved } from './helpers'

test.describe('pop modes', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'Pond')
  })

  test('fun mode is the default: bubbles lose their words, pop, come back, and nothing is deleted', async ({ page }) => {
    const before = (await saved(page))!.tasks.length
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0) // no warning: nothing here deletes
    const real = page.locator('[data-node]').first()
    // the real bubbles are put away and plain ones (same places, sizes and colours, no words) take over
    await expect.poll(() => real.evaluate((e) => getComputedStyle(e).opacity)).toBe('0')
    expect(await real.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none')
    const n = await page.locator('[data-node]').count()
    await expect.poll(() => page.locator('[data-stray] .pad').count()).toBeGreaterThanOrEqual(n - 1)
    expect(await page.locator('[data-stray] .pad').first().innerText()).toBe('')
    const box = (await page.locator('[data-stray] .pad').first().boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(700)
    expect(await page.locator('[data-node]').count()).toBe(n)
    expect((await saved(page))!.tasks.length).toBe(before)
    // the real ones come back when pop mode ends
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect.poll(() => real.evaluate((e) => getComputedStyle(e).opacity), { timeout: 4000 }).toBe('1')
    await page.screenshot({ path: 'test-results/popfun.png' })
  })

  test('the plain bubbles take over exactly where the real ones are, at their size and colour', async ({ page }) => {
    await page.waitForTimeout(1500)
    const read = (sel: string) => page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, hue: e.getAttribute('data-hue') } }), sel)
    const before = await read('[data-node] .pad')
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.waitForTimeout(60)
    const after = await read('[data-stray] .pad')
    expect(after.length).toBe(before.length)
    for (const b of before) {
      const near = after.reduce((best, a) => (Math.hypot(a.x - b.x, a.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y) ? a : best))
      expect(Math.hypot(near.x - b.x, near.y - b.y)).toBeLessThan(4)
      expect(Math.abs(near.w - b.w)).toBeLessThan(4)
      expect(near.hue).toBe(b.hue)
    }
  })

  test('in pop mode the checkbox cannot be used, fun pops are not undoable, and a tap on the water adds nothing', async ({ page }) => {
    const before = await saved(page)
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.waitForTimeout(1000)
    const check = page.locator('[data-node] .pad button[aria-label*="done" i], [data-node] .pad button[aria-label*="Mark"]').first()
    const c = (await check.boundingBox())!
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2)
    await page.waitForTimeout(700)
    const after = await saved(page)
    expect(after!.tasks.map((t) => t.status)).toEqual(before!.tasks.map((t) => t.status))
    expect(after!.tasks.map((t) => t.log.length)).toEqual(before!.tasks.map((t) => t.log.length))
    // nothing was logged to undo
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-disabled', 'true')
    // the water: a tap in a clear corner makes no new item
    const pond = (await page.locator('[aria-label^="Pond canvas"]').boundingBox())!
    await page.mouse.click(pond.x + 5, pond.y + pond.height / 2)
    await page.waitForTimeout(400)
    await expect(page.getByLabel('New item')).toHaveCount(0)
  })

  test('fun mode: clearing every bubble says "All cleared!", then the field fills again', async ({ page }) => {
    await page.getByRole('button', { name: 'Pop mode' }).click()
    const pads = page.locator('[data-stray] button:not([disabled])')
    await expect.poll(() => pads.count()).toBeGreaterThan(3)
    for (let guard = 0; guard < 60 && (await pads.count()) > 0; guard++) {
      await pads.first().dispatchEvent('pointerdown', { button: 0 })
      await page.waitForTimeout(40)
    }
    await expect(page.getByText('All cleared!')).toBeVisible({ timeout: 4000 })
    await expect(page.getByText('All cleared!')).toBeHidden({ timeout: 4000 })
    await expect.poll(() => pads.count(), { timeout: 6000 }).toBeGreaterThan(3)
  })

  test('the plain bubbles float over a ripple too, rising on the crest', async ({ page }) => {
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect.poll(() => page.locator('[data-stray] button').count()).toBeGreaterThan(3)
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-stray]')].filter((el) => el.getAnimations().some((a) => (a.effect as KeyframeEffect).getTiming().duration === 2400)).length)).toBe(0)
    await page.locator('[data-stray] button').first().dispatchEvent('pointerdown', { button: 0 })
    await expect
      .poll(() => page.evaluate(() => [...document.querySelectorAll('[data-stray]')].filter((el) => el.getAnimations().some((a) => (a.effect as KeyframeEffect).getTiming().duration === 2400)).length))
      .toBeGreaterThan(2)
  })

  test('checking an item off sends a ripple out, and the other bubbles bob', async ({ page }) => {
    const waves = () => page.evaluate(() => document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.getTiming().duration === 2400).length)
    expect(await waves()).toBe(0)
    const c = (await page.locator('[data-node] .pad button[aria-label*="done" i], [data-node] .pad button[aria-label*="Mark"]').first().boundingBox())!
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2) // (the bubbles drift, so no waiting for them to hold still)
    await expect.poll(waves).toBeGreaterThan(0)
  })

  test('in the game every bubble is at full strength like the pattern; in fun mode they vary', async ({ page }) => {
    const us = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-stray] .pad')].map((e) => Number(e.style.getPropertyValue('--u'))))
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect.poll(async () => (await us()).length).toBeGreaterThan(5)
    const fun = await us()
    expect(new Set(fun.map((u) => u.toFixed(2))).size).toBeGreaterThan(2) // varied, but never pale (50% or more)
    expect(Math.min(...fun)).toBeGreaterThanOrEqual(0.5)
    await page.getByRole('radio', { name: 'Game' }).click()
    await expect.poll(async () => (await us()).length).toBeGreaterThan(5)
    expect((await us()).every((u) => u === 1)).toBe(true)
    // and the pattern's own bubbles are made at full strength too
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('[aria-label="The pattern"] [data-hue]').first()).toBeVisible({ timeout: 6000 })
    await expect.poll(() => page.locator('[aria-label="The pattern"] [data-hue]').first().evaluate((e) => (e as HTMLElement).style.getPropertyValue('--u')), { timeout: 6000 }).toBe('1')
  })

  test('the pop game always has a bubble for every colour the pattern asks for, over several rounds', async ({ page }) => {
    test.setTimeout(90_000) // (the early rounds are slow on purpose)
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.getByRole('radio', { name: 'Game' }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    const status = page.getByRole('status')
    for (let round = 1; round <= 4; round++) {
      await expect(status).toContainText('Your turn', { timeout: 15000 })
      await expect(status).toContainText(`round ${round}`)
      const hues = await page.locator('[aria-label="The pattern"] [data-hue]').evaluateAll((els) => els.map((e) => e.getAttribute('data-hue')!))
      expect(hues).toHaveLength(round)
      for (const h of hues) {
        const bubble = page.locator(`[data-stray] .pad[data-hue="${h}"]:not([disabled])`)
        expect(await bubble.count(), `a bubble for colour ${h}`).toBeGreaterThan(0)
        await bubble.first().dispatchEvent('pointerdown', { button: 0 })
        await page.waitForTimeout(60)
      }
    }
    await expect(status).not.toContainText('Game over')
  })

  test('starting the game frames the bubbles clear of the score box, the pattern and the buttons', async ({ page }) => {
    test.setTimeout(60_000)
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.getByRole('radio', { name: 'Game' }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Your turn', { timeout: 15000 })
    await page.waitForTimeout(1600) // (the framing glides in slowly)
    const m = await page.evaluate(() => {
      const pond = document.querySelector('[aria-label^="Pond canvas"]')!.getBoundingClientRect()
      const bar = document.querySelector('[data-game-bar]')!.getBoundingClientRect()
      const r = [...document.querySelectorAll('[data-stray] .pad')].map((e) => e.getBoundingClientRect())
      return { fromBar: Math.min(...r.map((x) => x.top)) - bar.bottom, fromBottom: pond.bottom - Math.max(...r.map((x) => x.bottom)), fromSides: Math.min(Math.min(...r.map((x) => x.left)) - pond.left, pond.right - Math.max(...r.map((x) => x.right))) }
    })
    expect(m.fromBar).toBeGreaterThanOrEqual(-2)
    expect(m.fromBottom).toBeGreaterThanOrEqual(40)
    expect(m.fromSides).toBeGreaterThanOrEqual(0)
    await page.screenshot({ path: 'test-results/gameplay.png' })
  })

  test('the pop game: a right pop moves on, a wrong one ends it, and the scores are kept', async ({ page }) => {
    test.setTimeout(60_000)
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.getByRole('radio', { name: 'Game' }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByText('Watch and learn')).toBeVisible() // while the pattern is shown
    const status = page.getByRole('status')
    await expect(status).toContainText('Your turn', { timeout: 6000 })
    // under the pattern: "Your turn" with its hint
    await expect(page.locator('[data-turn-msg]')).toContainText('Your turn')
    await expect(page.locator('[data-turn-msg]')).toContainText('Tap the colors in order to match the sequence.')
    const want = await page.locator('[aria-label="The pattern"] [data-hue]').first().getAttribute('data-hue')
    const bubble = (hue: string, same: boolean) => (same ? page.locator(`[data-stray] .pad[data-hue="${hue}"]:not([disabled])`) : page.locator(`[data-stray] .pad:not([data-hue="${hue}"]):not([disabled])`))
    const pop = async (loc: ReturnType<typeof bubble>) => {
      const box = (await loc.first().boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    await page.screenshot({ path: 'test-results/popgame.png' })
    await pop(bubble(want!, true))
    await expect(page.locator('[data-turn-msg]')).toHaveCount(0) // gone as soon as there was a tap
    await expect(status).toContainText(/round 2/, { timeout: 4000 })
    await expect(status).toContainText('Your turn', { timeout: 8000 })
    // a colour that is not in the pattern's first place: game over (the pattern's first is `want` again or not; pick a colour in play that differs from the first of the sequence)
    const first = await page.locator('[aria-label="The pattern"] [data-hue]').first().getAttribute('data-hue')
    await pop(bubble(first!, false))
    await expect(status).toContainText('Game over')
    await page.screenshot({ path: 'test-results/gameover.png' })
    const st = (await saved(page))!.settings.popStats
    expect(st.games).toBe(1)
    expect(st.points).toBeGreaterThan(0)
    expect(st.best).toBe(st.points)
    // and the totals are in the overview
    await goto(page, 'Overview')
    await expect(page.getByLabel('Popping')).toContainText('high score')
    await expect(page.getByLabel('Popping')).toContainText('bubbles popped')
  })
})

test.describe('pop modes: group names and the pattern box', () => {
  test('the group names fade away in fun mode like the bubbles, and come back', async ({ page }) => {
    await open(page)
    await goto(page, 'Pond')
    await page.getByRole('radio', { name: 'Group' }).click() // gather by group: the names appear
    await page.waitForTimeout(900)
    const label = page.locator('.pond-label').first()
    await expect(label).toBeVisible()
    expect(await label.evaluate((e) => getComputedStyle(e).opacity)).not.toBe('0')
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect.poll(() => label.evaluate((e) => getComputedStyle(e).opacity), { timeout: 3000 }).toBe('0')
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect.poll(() => label.evaluate((e) => getComputedStyle(e).opacity), { timeout: 4000 }).toBe('1')
  })

  test('the pattern box shows two rows and scrolls', async ({ page }) => {
    test.setTimeout(60_000)
    await open(page)
    await goto(page, 'Pond')
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.getByRole('radio', { name: 'Game' }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    const box = page.locator('[aria-label="The pattern"]')
    await expect(box).toBeVisible()
    const st = await box.evaluate((e) => ({ max: getComputedStyle(e).maxHeight, oy: getComputedStyle(e).overflowY }))
    expect(parseFloat(st.max)).toBeGreaterThan(60)
    expect(parseFloat(st.max)).toBeLessThan(80) // two rows of bubbles, no more
    expect(st.oy).toBe('auto')
  })
})
