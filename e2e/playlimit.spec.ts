import { expect, test, type Page } from '@playwright/test'
import { goto, open, saved } from './helpers'

/** Start with the allowance almost used up, so the limit comes within a second. */
async function almostOut(page: Page) {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    raw.state.settings.playGate = { usedMs: 179_600, lockUntil: 0, level: 0, lastLockAt: 0 }
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await goto(page, 'Pond')
}

test.describe('limiting play', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'Pond')
  })

  test('fun mode: a ten second countdown, then a kind word and a break; deleting stays available', async ({ page }) => {
    test.setTimeout(60_000)
    await almostOut(page)
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect(page.getByRole('timer')).toContainText('until a break', { timeout: 4000 })
    await expect(page.getByRole('timer')).toContainText(/\d+\s*seconds?/)
    await page.screenshot({ path: 'test-results/playtimer.png' })
    await expect(page.locator('.break-note')).toContainText('That was a fun little break!', { timeout: 16000 })
    await expect(page.locator('.break-note')).toContainText('three minutes')
    await expect(page.getByRole('button', { name: 'Pop mode' })).toHaveAttribute('aria-pressed', 'false')
    await page.screenshot({ path: 'test-results/playbreak.png' })
    const gate = (await saved(page))!.settings.playGate
    expect(gate.level).toBe(1)
    expect(gate.lockUntil - Date.now()).toBeGreaterThan(170_000)
    // coming back too soon: the same message, and popping is only for deleting (with its warning)
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect(page.locator('.break-note')).toContainText('fun little break')
    await expect(page.getByRole('alert')).toContainText('Pop to delete!')
    await page.getByRole('radio', { name: 'Fun' }).click()
    await expect(page.getByRole('radio', { name: 'Delete' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('radio', { name: 'Game' }).click()
    await expect(page.getByRole('radio', { name: 'Delete' })).toHaveAttribute('aria-checked', 'true')
  })

  test('the pop game: the game in progress is played out, and the break begins when it ends', async ({ page }) => {
    test.setTimeout(60_000)
    await almostOut(page)
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.getByRole('radio', { name: 'Game' }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByRole('timer')).toContainText('Last game', { timeout: 6000 })
    const status = page.getByRole('status').first()
    await expect(status).toContainText('Your turn', { timeout: 15000 })
    const want = await page.locator('[aria-label="The pattern"] [data-hue]').first().getAttribute('data-hue')
    // a wrong pop ends it
    await page.locator(`[data-stray] .pad:not([data-hue="${want}"]):not([disabled])`).first().dispatchEvent('pointerdown', { button: 0 })
    await expect(page.getByText('Game over!')).toBeVisible()
    await expect(page.getByText(/That was a fun little break!/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0)
  })

  test('the limit can be turned off in the settings', async ({ page }) => {
    await page.getByRole('button', { name: 'My settings' }).click()
    const sw = page.getByRole('switch', { name: /Limit play time/ })
    await expect(sw).toHaveAttribute('aria-checked', 'true') // on by default
    await sw.click()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await almostOut(page)
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.waitForTimeout(2500)
    await expect(page.getByRole('timer')).toHaveCount(0)
  })
})
