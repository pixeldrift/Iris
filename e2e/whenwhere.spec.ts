import { expect, test } from '@playwright/test'
import { goto, open, taskNamed } from './helpers'

test.describe('dates, reminders and a place on the details card', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
  })

  test('a due date and time with a reminder, a separate planned day tucked away, and a place for any item', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Plan the garden')
    await page.keyboard.press('Enter')
    // the boxes: When (From and Until, each a date and a time), Where, Priority
    await expect(page.getByRole('region', { name: 'When' })).toBeVisible()
    await expect(page.getByText(/^From/).first()).toBeAttached()
    await expect(page.getByText(/^Until/).first()).toBeAttached()
    await expect(page.getByRole('region', { name: 'Where' })).toBeVisible()
    await expect(page.getByText('Duration')).toBeVisible()
    await expect(page.getByText('Carry over')).toBeVisible()
    // there is no separate timeline start any more, and no reminder until there is a day
    await expect(page.getByText(/^Timeline start/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remind me that day' })).toHaveCount(0)
    // a place, for a plain task too
    await page.getByRole('textbox', { name: 'Where' }).fill('Back garden')
    await expect.poll(async () => (await taskNamed(page, 'Plan the garden'))?.place).toBe('Back garden')
    // Until, and its reminder
    await page.getByText(/^Until/).locator('xpath=..').getByRole('button').first().click()
    await page.locator('div.fixed.z-\\[150\\]').getByRole('button', { name: new RegExp(`^${new Date(Date.now() + 3 * 86400_000).getDate()}$`) }).first().click()
    await page.getByRole('button', { name: 'Remind me', exact: true }).click()
    await page.getByRole('radiogroup', { name: 'Remind me' }).getByRole('radio', { name: 'This evening' }).click()
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
  await page.getByRole('textbox', { name: 'Where' }).fill('12 Oak St, Springfield')
  const map = page.getByRole('link', { name: 'Show on a map' })
  await expect(map).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=12%20Oak%20St/)
  await expect(map).toHaveAttribute('target', '_blank')
  // on its row in the list
  await expect(page.locator('[data-lift-id^="task:"]', { hasText: 'Water the beans' }).getByText('12 Oak St, Springfield')).toBeVisible()
  // a link opens as itself
  await page.getByRole('textbox', { name: 'Where' }).fill('https://meet.example.com/room-9')
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

test('quick add reads "at <place>" into the place', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  await page.keyboard.press('n')
  await page.keyboard.type('Haircut at Main Street Salon')
  await expect(page.getByText('At Main Street Salon')).toBeVisible() // the preview says what it understood
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await taskNamed(page, 'Haircut'))?.place).toBe('Main Street Salon')
})
