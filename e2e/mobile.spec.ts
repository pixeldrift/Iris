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

  test('a field that the keyboard would cover is scrolled back into view', async ({ page }) => {
    await toList(page)
    await page.locator('[data-lift-id^="task:"]').first().tap()
    const notes = page.locator('textarea[placeholder^="Notes"]')
    await notes.scrollIntoViewIfNeeded()
    await notes.focus()
    await page.setViewportSize({ width: 390, height: 430 }) // what is left above a keyboard
    await expect
      .poll(() => notes.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight }))
      .toBe(true)
  })
})

test.describe('a phone turned sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('the menu sits beside the content, folds away by tapping the title, and the content takes the room', async ({ page }) => {
    await open(page)
    const aside = page.locator('aside')
    const main = page.locator('main')
    // beside the content, not over it
    const open1 = await aside.boundingBox()
    const m1 = await main.boundingBox()
    expect(open1!.width).toBeGreaterThan(200)
    expect(m1!.x).toBeGreaterThanOrEqual(open1!.x + open1!.width - 1)
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(0)

    // tapping the title folds it away and the content grows to fill the screen
    await page.getByRole('button', { name: 'Hide the menu' }).click()
    await expect(async () => {
      const m2 = await main.boundingBox()
      expect(m2!.width).toBeGreaterThan(m1!.width + 200)
      expect((await aside.boundingBox())!.width).toBeLessThan(2)
    }).toPass()

    // the menu button in the title bar brings it back, again beside the content
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(async () => {
      expect(Math.abs((await main.boundingBox())!.width - m1!.width)).toBeLessThan(2)
    }).toPass()
  })

  test('a notch on either side keeps the menu, the content and dialogs clear of it', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 59, right: 0, top: 0, bottom: 21 } })
    await open(page)
    expect((await page.locator('aside').boundingBox())!.x).toBeGreaterThanOrEqual(59)
    await page.getByRole('button', { name: 'Hide the menu' }).click()
    await expect(async () => expect((await page.getByRole('button', { name: 'Menu', exact: true }).boundingBox())!.x).toBeGreaterThanOrEqual(59)).toPass()
    // the other way round: the right edge of the content stops short of the notch
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 0, right: 59, top: 0, bottom: 21 } })
    await expect(async () => {
      const m = (await page.locator('main').boundingBox())!
      expect(m.x + m.width).toBeLessThanOrEqual(844 - 59 + 1)
    }).toPass()
    // a dialog keeps its distance too
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'My settings' }).first().click()
    const d = (await page.getByRole('dialog').boundingBox())!
    expect(d.x + d.width).toBeLessThanOrEqual(844 - 59 + 1)
  })
})
