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
