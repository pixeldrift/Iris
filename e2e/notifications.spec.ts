import { expect, test, type Page } from '@playwright/test'
import { savedReady } from './helpers'

/** Reload with `n` reminders that have already gone off, as if they fired while the app was shut. */
async function withReminders(page: Page, n: number) {
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await savedReady(page)
  await page.evaluate((count) => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    const base = raw.state.tasks.find((t: { title: string }) => !t.title.includes('Study'))
    // clear the demo's own reminders so only these are waiting
    raw.state.tasks = raw.state.tasks.map((t: Record<string, unknown>) => ({ ...t, remindAt: null, alerts: [], alertsDone: [] }))
    for (let i = 0; i < count; i++) raw.state.tasks.push({ ...base, id: `due-${i}`, title: `Reminder ${i + 1}`, remindAt: Date.now() - 1000 * (i + 1), reminded: false, alerts: [], remindBefore: null, due: null, day: null })
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
  }, n)
  await page.reload()
  await page.locator('[data-node]').first().waitFor()
}

test.describe('reminder cards', () => {
  test('only one card at a time, with a badge for the rest that opens the notifications list', async ({ page }) => {
    await withReminders(page, 4)
    await expect(page.getByRole('alert')).toHaveCount(1)
    const more = page.getByRole('button', { name: /3 more notifications/ })
    await expect(more).toBeVisible()
    await more.click()
    const list = page.getByRole('dialog', { name: 'Notifications' })
    await expect(list.getByRole('listitem')).toHaveCount(4)
    await expect(list.getByRole('switch', { name: /Allow notifications/ })).toBeVisible() // the same switch as in Settings, kept out of the list
    // dismissing one from the list leaves the rest
    await list.getByRole('button', { name: /^Dismiss/ }).first().click()
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await list.getByRole('button', { name: 'Clear all' }).click()
    await expect(list.getByText('Nothing new.')).toBeVisible()
    await list.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('swiping a card to the left sends it away and the next one takes its place', async ({ page }) => {
    await withReminders(page, 3)
    const card = page.getByRole('alert')
    await expect(card).toHaveCount(1)
    const first = await card.locator('p').first().innerText()
    const b = (await card.boundingBox())!
    await page.mouse.move(b.x + b.width - 60, b.y + 20)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width - 60 - i * 25, b.y + 20)
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /1 more notification$/ })).toBeVisible() // 3 -> 2 left: "+1 more"
    await expect(page.getByRole('alert').locator('p').first()).not.toHaveText(first)
    // the close button still works too
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('button', { name: /more notification/ })).toHaveCount(0)
  })
})

test.describe('the notifications box', () => {
  test('keeps its size when something is cleared (until it is closed and opened again), and a cleared one pops away', async ({ page }) => {
    await withReminders(page, 4)
    await page.getByRole('button', { name: /3 more notifications/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Notifications' })
    await expect(dialog.getByRole('listitem')).toHaveCount(4)
    await page.waitForTimeout(600)
    const full = (await dialog.boundingBox())!.height
    await dialog.getByRole('button', { name: /^Dismiss/ }).first().click()
    // it pops, then goes (the others glide up)...
    await expect(dialog.getByRole('listitem')).toHaveCount(3, { timeout: 2000 })
    await page.waitForTimeout(500)
    // ...and the box stays as tall as it was
    expect(Math.abs((await dialog.boundingBox())!.height - full)).toBeLessThan(2)
    // opened again, it fits what is there
    await dialog.getByRole('button', { name: 'Close notifications' }).click()
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toHaveCount(0)
    await page.getByRole('button', { name: /(\d+) more notifications?|notifications/i }).first().click()
    await page.waitForTimeout(600)
    expect((await page.getByRole('dialog', { name: 'Notifications' }).boundingBox())!.height).toBeLessThan(full - 20)
  })
})
