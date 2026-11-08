import { expect, test } from '@playwright/test'
import { goto, savedReady } from './helpers'

const iso = (d: number) => {
  const t = new Date(Date.now() + d * 86400_000)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

async function setUp(page: import('@playwright/test').Page, showDone: boolean) {
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await savedReady(page)
  await page.evaluate(([past, future, showDone]) => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    const base = raw.state.tasks.find((x: { title: string }) => x.title === 'Pay rent')
    const mk = (id: string, title: string, day: string) => ({ ...base, id, title, kind: 'event', day, time: '15:00', endTime: '16:00', due: null, repeat: null, status: 'todo', folderIds: [], personIds: [] })
    raw.state.tasks.push(mk('ev-past', 'Old concert', past), mk('ev-future', 'Next concert', future))
    raw.state.settings.showDone = showDone
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
  }, [iso(-3), iso(3), showDone] as const)
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await goto(page, 'List')
}

test.describe('events that are over', () => {
  test('are hidden with the finished ones, like completed tasks', async ({ page }) => {
    await setUp(page, false)
    await expect(page.getByText('Next concert', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Old concert', { exact: true })).toHaveCount(0)
  })

  test('show faded when completed items are shown', async ({ page }) => {
    await setUp(page, true)
    const row = page.locator('[data-lift-id^="task:"]').filter({ hasText: 'Old concert' }).first()
    await expect(row).toBeVisible()
    const next = page.locator('[data-lift-id^="task:"]').filter({ hasText: 'Next concert' }).first()
    // the same look as a checked task (struck through and faint); one still to come is plain
    expect(await row.innerHTML()).toContain('line-through')
    expect(await next.innerHTML()).not.toContain('line-through')
  })
})

test.describe('a list keeps the rest folded away', () => {
  test('its dates, place and priority are behind twirl-downs', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-node]').first().waitFor()
    await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
    await goto(page, 'List')
    await page.keyboard.press('n')
    await page.keyboard.type('list: Groceries')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    await expect(dialog.getByLabel('Add item')).toBeVisible()
    await expect(dialog.getByText(/^From/)).toHaveCount(0)
    await dialog.getByRole('button', { name: 'When' }).click()
    await expect(dialog.getByText(/^From/)).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Where' })).toHaveCount(0)
    await expect(dialog.getByRole('slider', { name: 'How much it matters' })).toHaveCount(0)
  })
})
