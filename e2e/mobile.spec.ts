import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true })

  const touch = async (page: import('@playwright/test').Page) => {
    const cdp = await page.context().newCDPSession(page)
    return (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  }
  const toList = async (page: import('@playwright/test').Page) => {
    await open(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await goto(page, 'List')
  }

  test('swiping a list row far to the left deletes it with an Undo; a short swipe or a scroll does not', async ({ page }) => {
    await toList(page)
    const rows = page.locator('[data-lift-id^="task:"]')
    const n = await rows.count()
    const t = await touch(page)
    const b = (await rows.first().boundingBox())!
    // short: springs back
    await t('touchStart', b.x + b.width - 60, b.y + 20)
    for (let i = 1; i <= 5; i++) await t('touchMove', b.x + b.width - 60 - i * 10, b.y + 20)
    await t('touchEnd')
    await page.waitForTimeout(500)
    expect(await rows.count()).toBe(n)
    // long: gone, with Undo offered
    const b3 = (await rows.first().boundingBox())!
    await t('touchStart', b3.x + b3.width - 30, b3.y + 20)
    for (let i = 1; i <= 14; i++) await t('touchMove', b3.x + b3.width - 30 - i * 20, b3.y + 20)
    await t('touchEnd')
    await expect(page.getByRole('status')).toContainText('Deleted')
    await expect.poll(() => rows.count()).toBe(n - 1)
    await page.getByRole('button', { name: 'Undo' }).first().click()
    await expect.poll(() => rows.count()).toBe(n)
    // mostly vertical: a scroll, not a swipe
    const b2 = (await rows.first().boundingBox())!
    await t('touchStart', b2.x + 200, b2.y + 20)
    for (let i = 1; i <= 6; i++) await t('touchMove', b2.x + 200 - i * 3, b2.y + 20 - i * 12)
    await t('touchEnd')
    await page.waitForTimeout(400)
    expect(await rows.count()).toBe(n)
  })

  test('swiping a list row to the right checks it off, with a line drawn across its name; a short swipe does not', async ({ page }) => {
    await toList(page)
    const rows = page.locator('[data-lift-id^="task:"]')
    const t = await touch(page)
    const row = rows.filter({ hasText: 'Lab report' }).first() // (a plain task: a repeating one is ticked in its log, not its status)
    const id = (await row.getAttribute('data-lift-id'))!.slice('task:'.length)
    const status = () => page.evaluate((i) => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((x: { id: string }) => x.id === i).status, id)
    expect(await status()).not.toBe('done')
    // short: springs back
    const b = (await row.boundingBox())!
    await t('touchStart', b.x + 100, b.y + 20)
    for (let i = 1; i <= 5; i++) await t('touchMove', b.x + 100 + i * 10, b.y + 20)
    await t('touchEnd')
    await page.waitForTimeout(600)
    expect(await status()).not.toBe('done')
    // long: the line goes across, and it is ticked
    const b2 = (await row.boundingBox())!
    await t('touchStart', b2.x + 100, b2.y + 20)
    for (let i = 1; i <= 14; i++) await t('touchMove', b2.x + 100 + i * 20, b2.y + 20)
    await t('touchEnd')
    await expect.poll(status, { timeout: 4000 }).toBe('done')
  })

  test('a field that the keyboard would cover is scrolled back into view', async ({ page }) => {
    await toList(page)
    await page.locator('[data-lift-id^="task:"]').first().tap()
    const notes = page.locator('textarea[placeholder^="Notes"]')
    await notes.scrollIntoViewIfNeeded()
    await notes.click() // (a real tap: focusing it from a script makes the test runner insist on focus staying put)
    await page.setViewportSize({ width: 390, height: 430 }) // what is left above a keyboard
    await expect
      .poll(() => notes.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight }))
      .toBe(true)
  })
})

test.describe('on a phone: the week of days', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true })

  const week = async (page: import('@playwright/test').Page) => {
    await open(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await goto(page, 'Calendar')
    await page.getByRole('button', { name: 'week', exact: true }).click()
    const chip = page.locator('main [data-lift-id^="task:"]').first()
    await chip.scrollIntoViewIfNeeded()
    const b = (await chip.boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const x = b.x + b.width / 2
    const y = b.y + b.height / 2
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', py = y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: py }] })
    return { y, touch }
  }

  test('swiping along the days picks nothing up', async ({ page }) => {
    const { y, touch } = await week(page)
    await touch('touchStart')
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', y - i * 12)
      await page.waitForTimeout(20)
    }
    await expect(page.locator('.grabbed')).toHaveCount(0)
    await expect(page.locator('body.dragging')).toHaveCount(0)
    await touch('touchEnd')
  })

  test('resting a finger on an item raises it off the page with a shadow', async ({ page }) => {
    const { touch } = await week(page)
    await touch('touchStart')
    await page.waitForTimeout(500)
    await expect(page.locator('.grabbed')).toHaveCount(1)
    expect(await page.locator('.grabbed').evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')
    await touch('touchEnd')
    await expect(page.locator('.grabbed')).toHaveCount(0)
  })
})

test.describe('a phone turned sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('the menu sits beside the content, folds to a sliver from its title, and the content takes the room', async ({ page }) => {
    await open(page)
    const aside = page.locator('aside')
    const main = page.locator('main')
    // beside the content, not over it
    const open1 = await aside.boundingBox()
    const m1 = await main.boundingBox()
    expect(open1!.width).toBeGreaterThan(200)
    expect(m1!.x).toBeGreaterThanOrEqual(open1!.x + open1!.width - 1)
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(0)
    // there is no hover on a touch screen, so the groups' drag handles are always showing
    await expect(page.locator('[data-folder-row] span[title="Drag to move or nest"]').first()).toHaveCSS('opacity', '1')

    // tapping the title folds it to a sliver and the content grows to fill the screen
    await page.getByRole('button', { name: 'Hide the menu' }).click()
    await expect(async () => {
      const m2 = await main.boundingBox()
      expect(m2!.width).toBeGreaterThan(m1!.width + 180)
      const w = (await aside.boundingBox())!.width
      expect(w).toBeGreaterThan(30)
      expect(w).toBeLessThan(80)
    }).toPass()

    // the strip carries shortcuts: the views, and Everything
    await expect(page.getByRole('button', { name: 'Everything', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Calendar', exact: true }).click()
    await expect(page.locator('main header h2')).toContainText('Calendar')

    // tapping the logo brings the menu back, again beside the content
    await page.getByRole('button', { name: 'Show the menu' }).click()
    await expect(async () => {
      expect(Math.abs((await main.boundingBox())!.width - m1!.width)).toBeLessThan(2)
    }).toPass()
  })

  test('the add button is a plain circle, with the buttons down the right-hand side and the title turned', async ({ page }) => {
    await open(page)
    const add = page.getByRole('button', { name: 'New task' })
    const b = (await add.boundingBox())!
    expect(b.width).toBeLessThan(40)
    expect(await add.innerText()).not.toContain('New')
    expect(b.x + b.width).toBeGreaterThan(844 - 60) // down the right-hand side
    expect(b.y).toBeGreaterThan(390 / 2) // stacked toward the bottom
    // the instructions that explained gestures are not shown on a phone
    await expect(page.getByText(/pinch to zoom/)).toHaveCount(0)
  })

  test('only the notch side is kept clear, whichever way the phone is turned', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    // iOS reports the same inset on both sides of a phone turned sideways
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 59, right: 59, top: 0, bottom: 21 } })
    for (const [orientation, notchLeft] of [[90, true], [-90, false]] as const) {
      await page.addInitScript((o) => Object.defineProperty(window, 'orientation', { get: () => o, configurable: true }), orientation)
      await open(page)
      const aside = (await page.locator('aside').boundingBox())!
      const m = (await page.locator('main').boundingBox())!
      const contentLeft = (await page.getByRole('button', { name: 'Hide the menu' }).boundingBox())!.x
      if (notchLeft) {
        expect(contentLeft).toBeGreaterThan(40) // the menu's words are clear of the notch
        expect(contentLeft).toBeLessThan(75) // …but not given the full inset
        expect(Math.abs(m.x + m.width - 844)).toBeLessThan(2) // nothing is held back on the far side
      } else {
        expect(contentLeft).toBeLessThan(30) // no empty space on the side without the notch
        expect(m.x + m.width).toBeGreaterThan(844 - 60) // the content stops short of the notch on the right
        expect(m.x + m.width).toBeLessThan(844 - 30)
      }
      expect(aside.x).toBeLessThan(1) // the menu's glass starts at the screen's edge either way
      await page.getByRole('button', { name: 'Hide the menu' }).click()
      await page.waitForTimeout(700) // (the menu slides away)
      const logo = (await page.getByRole('button', { name: 'Show the menu' }).boundingBox())!
      if (notchLeft) expect(logo.x).toBeGreaterThanOrEqual(40) // the shortcuts stay out from under the notch
      else expect(logo.x).toBeLessThan(20)
      await page.reload()
    }
  })

  test('a dialog keeps clear of the notch', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 0, right: 59, top: 0, bottom: 21 } })
    await page.addInitScript(() => Object.defineProperty(window, 'orientation', { get: () => -90, configurable: true }))
    await open(page)
    await page.getByRole('button', { name: 'My settings' }).first().click()
    const d = (await page.getByRole('dialog').boundingBox())!
    expect(d.x + d.width).toBeLessThanOrEqual(844 - 40)
  })

  test('the quick add box is one row: the text, a type dropdown, Add at the far right and the close button in the corner', async ({ page }) => {
    await open(page)
    await page.evaluate(() => document.documentElement.style.setProperty('--kb', '200px')) // the keyboard's room
    await page.getByRole('button', { name: 'New task' }).click()
    const box = page.locator('#new-form')
    await expect(box).toBeVisible()
    await page.waitForTimeout(700) // (the box is still growing into place just after it opens)
    const input = (await page.getByLabel('New item').boundingBox())!
    const type = (await page.getByRole('button', { name: /^Type:/ }).boundingBox())!
    const add = (await page.getByRole('button', { name: '+ Add' }).boundingBox())!
    const close = (await page.getByRole('button', { name: 'Close', exact: true }).boundingBox())!
    // all on one line, left to right: text, type, Add, then the close button
    for (const b of [type, add]) expect(Math.abs(b.y + b.height / 2 - (input.y + input.height / 2))).toBeLessThan(14)
    expect(type.x).toBeGreaterThan(input.x + input.width - 2)
    expect(add.x).toBeGreaterThan(type.x + type.width)
    expect(close.x).toBeGreaterThan(add.x + add.width - 2)
    expect(close.y).toBeLessThan(input.y + 4) // up in the top corner
    // the dropdown changes the type
    await page.getByRole('button', { name: /^Type:/ }).click()
    await page.getByRole('option', { name: 'Event' }).or(page.getByRole('button', { name: 'Event', exact: true })).first().click()
    await expect(page.getByRole('button', { name: 'Type: Event' })).toBeVisible()
  })

  test('opening an item lays its panel over the content (which keeps its size), with no extra gap from the notch', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 59, right: 59, top: 0, bottom: 21 } })
    await page.addInitScript(() => Object.defineProperty(window, 'orientation', { get: () => 90, configurable: true }))
    await open(page)
    const main = (await page.locator('main').boundingBox())!
    const bub = (await page.locator('[data-node] [role=button]').nth(2).boundingBox())!
    await page.mouse.click(bub.x + bub.width / 2, bub.y + bub.height * 0.35) // (the bubbles drift, so a plain click would wait for them to hold still)
    const panel = page.getByRole('region', { name: 'Task details' }).or(page.locator('section[aria-label="Task details"]'))
    await expect(panel).toBeVisible()
    await page.waitForTimeout(800) // (the panel slides in)
    const p = (await panel.boundingBox())!
    expect(Math.abs((await page.locator('main').boundingBox())!.width - main.width)).toBeLessThan(2) // nothing squeezed
    // the notch is on the left: the panel has no safe-area padding of its own
    const title = (await panel.getByRole('button', { name: /Mark (not )?done/ }).first().boundingBox())!
    expect(title.x - p.x).toBeLessThan(40)
    expect(p.x + p.width).toBeLessThanOrEqual(844 + 1)
  })

  test('a text box low on the screen is typed into a bar at the top, above the keyboard, and the text lands in the box', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: /Address book/ }).first().click().catch(async () => {
      await page.locator('aside').getByRole('button', { name: /Address book/ }).first().click()
    })
    await page.getByRole('button', { name: 'Add a person' }).last().click()
    const notes = page.getByRole('dialog').getByPlaceholder('Notes') // (the typing bar's own box shares the placeholder, but is not in the dialog)
    await notes.scrollIntoViewIfNeeded()
    await notes.click() // (a real tap: the bar only opens for a focus that follows a gesture)
    // the bar appears at the top, named for the box
    const bar = page.locator('[data-input-proxy]')
    await expect(bar).toContainText('Notes')
    const typing = bar.getByLabel('Notes: type here')
    await expect(typing).toBeFocused()
    expect((await typing.boundingBox())!.y).toBeLessThan(60)
    await typing.fill('met at the lab')
    // the bar names the box, once: its label is shown, and the box inside has no placeholder repeating it
    await expect(bar.locator('textarea')).toHaveAttribute('placeholder', '')
    await bar.getByRole('button', { name: 'Done' }).click()
    // what was typed flies down to the box it belongs in
    await expect(page.locator('body > div.well')).toHaveCount(1)
    await expect(page.locator('body > div.well')).toHaveCount(0, { timeout: 3000 })
    await expect(notes).toHaveValue('met at the lab')
    await expect(bar).toHaveAttribute('aria-hidden', 'true') // and the bar goes away
    // cancelling throws the text away
    await notes.click()
    await bar.getByLabel('Notes: type here').fill('nope')
    await bar.getByRole('button', { name: 'Cancel' }).click()
    await expect(notes).toHaveValue('met at the lab')
  })

  test('the quick-add line, near the top of the screen, is typed into where it is', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'New task' }).click()
    const line = page.getByLabel('New item')
    await line.click()
    await expect(line).toBeFocused()
    await expect(page.locator('[data-input-proxy]')).toHaveAttribute('aria-hidden', 'true')
  })
})

test.describe('the typing bar, sideways: Enter commits', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('only add lines that need Return to do anything get it pressed; plain fields do not', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'orientation', { get: () => 90 }))
    await open(page)
    await goto(page, 'List')
    await expect(page.getByLabel('Add a task', { exact: true })).toHaveAttribute('data-proxy-commit', /.*/)
    await page.getByRole('button', { name: 'New task' }).click()
    await expect(page.getByLabel('New item')).toHaveAttribute('data-proxy-commit', /.*/)
    await page.keyboard.press('Escape')
    // a plain field (a task's notes, say) keeps its text as it is typed: nothing to commit
    await page.locator('[data-lift-id^="task:"]').first().click()
    await expect(page.getByLabel('Notes')).not.toHaveAttribute('data-proxy-commit', /.*/)
  })

  test('pressing Enter in the bar flies the text to the list\'s add line and presses Enter there: a new item', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'orientation', { get: () => 90 }))
    await open(page)
    await goto(page, 'List')
    const rows = page.locator('[data-lift-id^="task:"]')
    const n = await rows.count()
    await page.getByLabel('Add a task', { exact: true }).click()
    const bar = page.locator('[data-input-proxy]')
    const typing = bar.getByLabel(/type here/i)
    await expect(typing).toBeFocused()
    await typing.fill('Buy oat milk')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Buy oat milk', { exact: true }).first()).toBeVisible({ timeout: 4000 })
    await expect(rows).toHaveCount(n + 1)
  })
})

test.describe('Progress on a phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('swiping on a card scrolls the view (sideways to the other stages) and a card is only picked up after a short hold', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'orientation', { get: () => 90 }))
    await open(page)
    await goto(page, 'Progress')
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
    const columns = page.locator('[data-stage]').first().locator('xpath=..')
    expect(await columns.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true) // more stages than fit: a sideways swipe should reach them
    const card = page.locator('[data-card-id]').nth(1)
    const b = (await card.boundingBox())!
    const x = b.x + b.width / 2
    const y = b.y + b.height / 2
    await touch('touchStart', x, y)
    // not lifted at the instant of touching: a finger has to rest a moment first
    await page.waitForTimeout(120)
    expect(await card.evaluate((e) => new DOMMatrix(getComputedStyle(e.querySelector('.lift-on-press') ?? e).transform).a)).toBeCloseTo(1, 2)
    expect(await page.evaluate(() => document.body.classList.contains('dragging'))).toBe(false)
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', x - i * 30, y)
      await page.waitForTimeout(16)
    }
    await touch('touchEnd')
    await page.waitForTimeout(400)
    expect(await columns.evaluate((e) => e.scrollLeft)).toBeGreaterThan(40)
    expect(await page.evaluate(() => document.body.classList.contains('dragging'))).toBe(false)
  })
})
