import { expect, test } from '@playwright/test'
import { open, saved } from './helpers'

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'My settings' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('the colour slider recolours the whole interface, and its dot resets it', async ({ page }) => {
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
    await page.getByRole('button', { name: 'Clear everything…' }).click()
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
