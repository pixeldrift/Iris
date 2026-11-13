import { expect, test } from '@playwright/test'
import { open, saved } from './helpers'

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'My settings' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('the colour slider recolours the whole interface, and its dot resets it @smoke', async ({ page }) => {
    const slider = page.getByLabel('Interface color')
    const box = (await slider.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2)
    const lilac = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--color-lilac-500'))
    await expect.poll(lilac).not.toBe('')
    await page.getByRole('button', { name: 'Back to the original violet' }).click()
    await expect.poll(lilac).toBe('')
  })

  test('holding a slider crops the dialog around it, and the spacing dot resets', async ({ page }) => {
    const slider = page.getByLabel('Sidebar spacing')
    const box = (await slider.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 5 })
    await page.waitForTimeout(600)
    const clip = await page.getByRole('dialog').evaluate((e) => getComputedStyle(e).clipPath)
    expect(clip).toContain('inset')
    await page.mouse.up()
    await expect.poll(async () => (await saved(page))!.settings.sidebarSpace).toBeGreaterThan(0.8)
    await page.getByRole('button', { name: 'Reset spacing' }).click()
    await expect.poll(async () => (await saved(page))!.settings.sidebarSpace).toBe(0.5)
  })

  test('automatic completion of past-dated items is on by default and can be disabled', async ({ page }) => {
    const automatic = page.getByRole('switch', { name: /Automatically complete past-due items/ })
    await expect(automatic).toHaveAttribute('aria-checked', 'true')
    await automatic.click()
    await expect(automatic).toHaveAttribute('aria-checked', 'false')
  })

  test('the tooltips switch turns the labels off', async ({ page }) => {
    await page.getByRole('switch', { name: /Tooltips/ }).click()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await page.getByRole('button', { name: 'Pop mode' }).hover()
    await page.waitForTimeout(700)
    expect(await page.locator('span.pointer-events-none.fixed').count()).toBe(0)
  })

  test('demo data can be removed and added back; clearing needs a typed word when signed out', async ({ page }) => {
    const count = async () => (await saved(page))?.tasks.length ?? -1
    await page.getByRole('button', { name: 'Remove demo data' }).click()
    await expect.poll(count).toBe(0)
    await page.getByRole('button', { name: 'Add demo data' }).click()
    await expect.poll(count).toBeGreaterThan(20)
    await page.getByRole('button', { name: 'Clear all data' }).click()
    const confirm = page.getByRole('button', { name: 'Clear everything', exact: true })
    await expect(confirm).toBeDisabled()
    await page.getByLabel('Confirmation word').fill('DELETE')
    await confirm.click()
    await expect.poll(count).toBe(0)
  })

  test('there is a close button, and no Done / Save', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Close settings' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('notifications switch', () => {
  test('once allowed, the switch stays and can be turned off and on again', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    // (headless Chromium does not report a grant, so the browser's answer is set by hand: allowed)
    await ctx.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'granted' }))
    const page = await ctx.newPage()
    await page.goto('http://localhost:4173')
    await page.locator('[data-node]').first().waitFor()
    await page.getByRole('button', { name: 'My settings' }).click()
    const sw = page.getByRole('switch', { name: /Notifications/ })
    await expect(sw).toHaveAttribute('aria-checked', 'true') // allowed by the browser: on, and still a switch
    await expect(sw).toContainText('Alerts arrive even when Lilac is closed')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await expect(sw).toContainText('Off: reminders only appear inside Lilac')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await ctx.close()
  })
})

test('the tips and gestures list is there, folded until opened', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'My settings' }).click()
  const tips = page.getByRole('button', { name: /Tips and gestures/ })
  await expect(tips).toHaveAttribute('aria-expanded', 'false')
  await tips.click()
  await expect(page.getByText('Hold a task over a folded group')).toBeVisible()
})
