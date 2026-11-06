import { expect, test } from '@playwright/test'
import { goto, open, taskNamed } from './helpers'

test.describe('the task and notion panels', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
  })

  test('a task panel runs: group, due (with a time) and its reminder, repeats, notes, then the sliders side by side', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Pay rent')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    const y = async (name: string | RegExp) => (await dialog.getByText(name).first().boundingBox())!.y
    // the order, top down
    const due = await y(/^Due/)
    const repeats = await y(/^Repeats/)
    const notes = (await dialog.getByLabel('Notes').boundingBox())!.y
    const sliders = (await dialog.getByRole('slider', { name: 'How much it matters' }).boundingBox())!.y
    expect(due).toBeLessThan(repeats)
    expect(repeats).toBeLessThan(notes)
    expect(notes).toBeLessThan(sliders)
    // the two sliders share a line
    const urgent = (await dialog.getByRole('slider', { name: 'How urgent it is' }).boundingBox())!.y
    expect(Math.abs(urgent - sliders)).toBeLessThan(6)
    // repeats are folded away, with a pointer to habits
    await expect(dialog.getByText(/a Habit is usually the better fit/)).toHaveCount(0)
    await dialog.getByRole('button', { name: /^Repeats/ }).click()
    await expect(dialog.getByText(/a Habit is usually the better fit/)).toBeVisible()
  })

  test('a due date brings a reminder with it (a time too, if there is one), and a removed one stays removed', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Send the form')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    // choose a due day: the day buttons in the picker
    await dialog.getByRole('button', { name: /No date/ }).first().click()
    const day = new Date(Date.now() + 3 * 86400_000).getDate()
    await page.locator('div.fixed.z-\\[150\\]').getByRole('button', { name: new RegExp(`^${day}$`) }).first().click()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.due).toBeTruthy()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.dueRemindAt).toBeTruthy() // (the morning of)
    expect((await taskNamed(page, 'Send the form'))?.dueRemindBefore).toBe(0)
    // taken away, it is not put back when the date changes
    await dialog.getByRole('button', { name: /Remove remind me/i }).click()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.dueRemindAt ?? null).toBeNull()
  })

  test('a notion has only where it belongs, a big notes box and a picture', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('notion: a line for a poem')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    await expect(dialog.getByLabel('Notes')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Add a picture/ })).toBeVisible()
    for (const gone of [/^Due/, /Remind me/, /Repeats/, /Importance/, /Urgency/, /Stage/, /Assigned to/]) await expect(dialog.getByText(gone)).toHaveCount(0)
    const rows = await dialog.getByLabel('Notes').evaluate((e) => (e as HTMLTextAreaElement).rows)
    expect(rows).toBeGreaterThanOrEqual(8)
  })

  test('the type is only a layout: giving a task a start time makes it an event, and a due time is just as optional', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Write the report')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    expect((await taskNamed(page, 'Write the report'))?.kind).toBe('task')
    // the work day, with a start (an hour to work on it)
    await dialog.getByRole('button', { name: /Plan a day to work on it/ }).click()
    await dialog.getByRole('button', { name: /No date/ }).nth(1).click() // (the second picker: Due is the first)
    const pop = page.locator('div.fixed.z-\\[150\\]')
    const day = new Date(Date.now() + 2 * 86400_000).getDate()
    await pop.getByRole('button', { name: new RegExp(`^${day}$`) }).first().click()
    await expect.poll(async () => (await taskNamed(page, 'Write the report'))?.day).toBeTruthy()
    await dialog.getByText('–None–').first().click()
    await page.getByRole('listbox', { name: 'Hour' }).getByRole('option', { name: '3', exact: true }).nth(3).click()
    await page.getByRole('listbox', { name: 'AM or PM' }).getByRole('option', { name: 'PM' }).nth(3).click()
    await expect.poll(async () => (await taskNamed(page, 'Write the report'))?.time).toBeTruthy()
    await expect.poll(async () => (await taskNamed(page, 'Write the report'))?.kind).toBe('event')
    // the deadline's time is optional too: it shows once there is a due date, and says "Any time"
    await dialog.getByRole('button', { name: /No date/ }).first().click()
    await pop.getByRole('button', { name: new RegExp(`^${new Date(Date.now() + 4 * 86400_000).getDate()}$`) }).first().click()
    await expect(dialog.getByText('Any time')).toBeVisible()
  })
})
