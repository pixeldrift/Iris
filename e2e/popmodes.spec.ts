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
    const first = page.locator('[data-node] [role=button]').first()
    // the words and marks fade away: only size and colour are left
    await expect.poll(() => first.evaluate((e) => getComputedStyle(e.firstElementChild!).opacity)).toBe('0')
    const n = await page.locator('[data-node]').count()
    const box = (await first.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(700)
    expect(await page.locator('[data-node]').count()).toBe(n)
    expect((await saved(page))!.tasks.length).toBe(before)
    // the words come back when pop mode ends
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await expect.poll(() => first.evaluate((e) => getComputedStyle(e.firstElementChild!).opacity), { timeout: 4000 }).toBe('1')
    await page.screenshot({ path: 'test-results/popfun.png' })
  })

  test('the pop game: a right pop moves on, a wrong one ends it, and the scores are kept', async ({ page }) => {
    await page.getByRole('button', { name: 'Pop mode' }).click()
    await page.getByRole('radio', { name: 'Game' }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    const status = page.getByRole('status')
    await expect(status).toContainText('Your turn', { timeout: 6000 })
    const want = await page.locator('[aria-label="The pattern"] [data-hue]').first().getAttribute('data-hue')
    const bubble = (hue: string, same: boolean) => page.locator(`[data-node] [role=button]${same ? `[data-hue="${hue}"]` : `:not([data-hue="${hue}"])`}`)
    const pop = async (loc: ReturnType<typeof bubble>) => {
      const box = (await loc.first().boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    await page.screenshot({ path: 'test-results/popgame.png' })
    await pop(bubble(want!, true))
    await expect(status).toContainText('Round 2', { timeout: 4000 })
    await expect(status).toContainText('Your turn', { timeout: 8000 })
    // a colour that is not in the pattern's first place: game over (the pattern's first is `want` again or not; pick a colour in play that differs from the first of the sequence)
    const first = await page.locator('[aria-label="The pattern"] [data-hue]').first().getAttribute('data-hue')
    await pop(bubble(first!, false))
    await expect(status).toContainText('Game over')
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
