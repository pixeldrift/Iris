import { expect, test } from '@playwright/test'
import { goto, savedReady } from './helpers'

const iso = (d: number) => {
  const t = new Date(Date.now() + d * 86400_000)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

async function setUp(page: import('@playwright/test').Page, showDone: boolean, autoEvents = true) {
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await savedReady(page)
  await page.evaluate(([past, future, showDone, autoEvents]) => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    const base = raw.state.tasks.find((x: { title: string }) => x.title === 'Pay rent')
    const mk = (id: string, title: string, day: string) => ({ ...base, id, title, kind: 'event', day, time: '15:00', endTime: '16:00', due: null, repeat: null, status: 'todo', folderIds: [], personIds: [] })
    raw.state.tasks.push(mk('ev-past', 'Old concert', past), mk('ev-future', 'Next concert', future))
    const task = { ...base, id: 'task-past', title: 'Late essay', kind: 'task', day: null, time: null, endTime: null, due: past, repeat: null, status: 'todo', folderIds: [], personIds: [] }
    raw.state.tasks.push(task)
    raw.state.settings.showDone = showDone
    raw.state.settings.autoCompleteEvents = autoEvents
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
  }, [iso(-3), iso(3), showDone, autoEvents] as const)
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await goto(page, 'List')
}

test.describe('nothing is finished for you', () => {
  test('a task past its deadline stays open and findable, whatever the setting; events too unless asked', async ({ page }) => {
    await setUp(page, false, false)
    await expect(page.getByText('Late essay', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Old concert', { exact: true }).first()).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(page.getByText('Late essay', { exact: true }).first()).toBeVisible()
  })

  test('with past events switched on, tasks are still left alone, and an event brought back stays back', async ({ page }) => {
    await setUp(page, true)
    await expect(page.locator('[data-lift-id^="task:"]').filter({ hasText: 'Late essay' }).first()).not.toContainText('line-through')
    const status = (id: string) => page.evaluate((i) => JSON.parse(localStorage.getItem('lilac-v1')!).state.tasks.find((t: { id: string }) => t.id === i)?.status, id)
    await expect.poll(() => status('ev-past')).toBe('done')
    expect(await status('task-past')).toBe('todo')
    // un-check the event: the rollover (which runs every minute) must not finish it again
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
      const t = raw.state.tasks.find((x: { id: string }) => x.id === 'ev-past')
      t.status = 'todo'
      localStorage.setItem('lilac-v1', JSON.stringify(raw))
    })
    await page.reload()
    await page.locator('[data-lift-id^="task:"]').first().waitFor()
    await page.waitForTimeout(1500)
    expect(await status('ev-past')).toBe('todo')
  })
})

test.describe('the Overdue filter', () => {
  test('lists late tasks and ended events, and one tap checks off the events', async ({ page }) => {
    await setUp(page, false, false)
    await page.getByRole('button', { name: /^Overdue/ }).click()
    await expect(page.getByText('Late essay', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Old concert', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Next concert', { exact: true })).toHaveCount(0) // (still to come)
    await page.getByRole('button', { name: 'Check off past events' }).click()
    await page.getByRole('button', { name: 'Check off', exact: true }).click()
    await expect(page.getByText('Old concert', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Late essay', { exact: true }).first()).toBeVisible() // (a task is only ever checked off by you)
    await expect(page.getByRole('button', { name: 'Check off past events' })).toHaveCount(0)
  })

  test('the day-end hour is a setting beside the past-events switch', async ({ page }) => {
    await setUp(page, false, false)
    await page.getByRole('button', { name: 'My settings' }).click()
    const hour = page.getByRole('combobox', { name: 'My day ends at' })
    await expect(hour).toHaveValue('4')
    await hour.selectOption('2')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-v1')!).state.settings.dayEndsAt)).toBe(2)
  })
})

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
    await expect(dialog.getByText(/^Day/)).toHaveCount(0)
    await dialog.getByRole('button', { name: 'When' }).click()
    await expect(dialog.getByText(/^Day/)).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Where' })).toHaveCount(0)
    await expect(dialog.getByRole('slider', { name: 'How much it matters' })).toHaveCount(0)
  })
})
