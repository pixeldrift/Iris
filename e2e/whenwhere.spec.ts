import { expect, test } from '@playwright/test'
import { goto, open, taskNamed } from './helpers'

test.describe('dates, reminders and a place on the details card', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
  })

  test('two plain dates, each with a reminder of its own, and a place for any item', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Plan the garden')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/^Plan for/).first()).toBeAttached()
    await expect(page.getByText(/^Deadline/).first()).toBeAttached()
    await expect(page.getByText(/^Do on/)).toHaveCount(0)
    await expect(page.getByText(/^Due by/)).toHaveCount(0)
    // the timeline start and carry-over are tucked under More
    await expect(page.getByText(/^Timeline start/)).toHaveCount(0)
    await page.getByRole('button', { name: 'More options' }).click()
    await expect(page.getByText(/^Timeline start/)).toBeAttached()
    // a place, for a plain task too
    await page.getByLabel('Where').fill('Back garden')
    await expect.poll(async () => (await taskNamed(page, 'Plan the garden'))?.place).toBe('Back garden')
    // a reminder on the day, one on the deadline: separate
    await page.getByRole('button', { name: 'Remind me on the day' }).click()
    await page.getByRole('radiogroup', { name: 'Remind me on the day' }).getByRole('radio', { name: 'In an hour' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Plan the garden'))?.remindAt).toBeTruthy()
    expect((await taskNamed(page, 'Plan the garden'))?.dueRemindAt ?? null).toBeNull()
    await page.getByRole('button', { name: 'Remind me before the deadline' }).click()
    await page.getByRole('radiogroup', { name: 'Remind me before the deadline' }).getByRole('radio', { name: 'This evening' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Plan the garden'))?.dueRemindAt).toBeTruthy()
    await page.screenshot({ path: 'test-results/when.png' })
  })

  test('both the day to do it and the deadline show on the calendar', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Two dates thing')
    await page.keyboard.press('Enter')
    const id = (await taskNamed(page, 'Two dates thing'))!.id
    // plan it for the 12th of this month and make it due on the 20th
    const mk = (d: number) => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
    await page.evaluate(([id, day, due]) => {
      const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
      const t = raw.state.tasks.find((x: { id: string }) => x.id === id)
      t.day = day
      t.due = due
      localStorage.setItem('lilac-v1', JSON.stringify(raw))
    }, [id, mk(12), mk(20)])
    await page.goto('/')
    await page.locator('aside nav button').first().waitFor()
    await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
    await goto(page, 'Calendar')
    const cell = (d: number) => page.locator(`[data-month-scroll] [data-drop="day:${mk(d)}"]`)
    await expect(cell(12).locator('[role=img]')).toBeVisible()
    await expect(cell(20).locator('[role=img]')).toBeVisible()
    const dots = async (d: number) => Number(((await cell(d).locator('[role=img]').getAttribute('aria-label')) ?? '').match(/^(\d+)/)?.[1] ?? 0)
    // the item counts on both days
    expect(await dots(12)).toBeGreaterThan(0)
    expect(await dots(20)).toBeGreaterThan(0)
  })
})

test('a place shows on the list row and the bubble, and opens in a map (or as a link)', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  await page.keyboard.press('n')
  await page.keyboard.type('Water the beans')
  await page.keyboard.press('Enter')
  await page.getByLabel('Where').fill('12 Oak St, Springfield')
  const map = page.getByRole('link', { name: 'Show on a map' })
  await expect(map).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=12%20Oak%20St/)
  await expect(map).toHaveAttribute('target', '_blank')
  // on its row in the list
  await expect(page.locator('[data-lift-id^="task:"]', { hasText: 'Water the beans' }).getByText('12 Oak St, Springfield')).toBeVisible()
  // a link opens as itself
  await page.getByLabel('Where').fill('https://meet.example.com/room-9')
  await expect(page.getByRole('link', { name: 'Open the link' })).toHaveAttribute('href', 'https://meet.example.com/room-9')
  // and the pond's bubble carries a pin
  await goto(page, 'Pond')
  await expect(page.getByRole('img', { name: 'At https://meet.example.com/room-9' })).toBeVisible()
})

test('the timeline shows only dated items, in the usual gradient-and-outline style, in tighter rows', async ({ page }) => {
  await open(page)
  await goto(page, 'Timeline')
  await expect(page.getByText('unscheduled')).toHaveCount(0)
  const bars = page.locator('.tint.cursor-grab')
  expect(await bars.count()).toBeGreaterThan(0)
  const rows = await page.evaluate(() => [...document.querySelectorAll('.tint.cursor-grab')].map((b) => b.parentElement!.getBoundingClientRect().height))
  expect(Math.max(...rows)).toBeLessThanOrEqual(34)
  await page.screenshot({ path: 'test-results/timeline.png' })
})
