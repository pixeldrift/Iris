import { expect, test } from '@playwright/test'
import { goto, open, taskNamed } from './helpers'

test.describe('the task and notion panels', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
  })

  test('a task panel runs: group, when (with a time), repeats, notes, then the sliders side by side', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Pay rent')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    const y = async (name: string | RegExp) => (await dialog.getByText(name).first().boundingBox())!.y
    // the order, top down
    const due = await y(/^From/)
    const repeats = await y(/^Repeats/)
    const notes = (await dialog.getByLabel('Notes').boundingBox())!.y
    const sliders = (await dialog.getByRole('slider', { name: 'How much it matters' }).boundingBox())!.y
    expect(due).toBeLessThan(repeats)
    expect(repeats).toBeLessThan(notes)
    expect(notes).toBeLessThan(sliders)
    // the two sliders share a line
    const urgent = (await dialog.getByRole('slider', { name: 'How urgent it is' }).boundingBox())!.y
    expect(Math.abs(urgent - sliders)).toBeLessThan(6)
    // repeats are folded away until wanted, and do not say "Repeats" a second time inside
    await expect(dialog.getByRole('radiogroup', { name: 'Repeats' })).toHaveCount(0)
    await dialog.getByRole('button', { name: /^Repeats/ }).click()
    await expect(dialog.getByRole('radiogroup', { name: 'Repeats' })).toBeVisible()
    await expect(dialog.getByText(/^Repeats/)).toHaveCount(1)
  })

  test('setting Until brings a reminder with it, and a removed one stays removed', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Send the form')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    // "Until" is the deadline: a date, and a time that is optional
    await expect(dialog.getByText(/^Until/)).toBeVisible()
    await dialog.getByText(/^Until/).locator('xpath=..').getByRole('button').first().click()
    const day0 = new Date(Date.now() + 3 * 86400_000).getDate()
    await page.locator('div.fixed.z-\\[150\\]').getByRole('button', { name: new RegExp(`^${day0}$`) }).first().click()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.due).toBeTruthy()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.dueRemindAt).toBeTruthy() // (the morning of)
    expect((await taskNamed(page, 'Send the form'))?.dueRemindBefore).toBe(0)
    // taken away, it is not put back when the date changes
    await dialog.getByRole('button', { name: /Remove remind me/i }).click()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.dueRemindAt ?? null).toBeNull()
    await dialog.getByText(/^Until/).locator('xpath=..').getByRole('button').first().click()
    await page.locator('div.fixed.z-\\[150\\]').getByRole('button', { name: new RegExp(`^${new Date(Date.now() + 5 * 86400_000).getDate()}$`) }).first().click()
    await page.waitForTimeout(400)
    expect((await taskNamed(page, 'Send the form'))?.dueRemindAt ?? null).toBeNull()
  })

  test('a notion has only where it belongs, a big notes box and a picture', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('notion: a line for a poem')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    await expect(dialog.getByLabel('Notes')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Add a picture/ })).toBeVisible()
    // a notion is not something to complete: no check mark, in the panel or on the list
    await expect(dialog.getByRole('button', { name: /Mark done/ })).toHaveCount(0)
    for (const gone of [/^From/, /^Until/, /Remind me/, /Repeats/, /Importance/, /Urgency/, /Stage/, /Assigned to/]) await expect(dialog.getByText(gone)).toHaveCount(0)
    const rows = await dialog.getByLabel('Notes').evaluate((e) => (e as HTMLTextAreaElement).rows)
    expect(rows).toBeGreaterThanOrEqual(8)
  })

  test('an event has no check mark: it is something you go to, not something you do', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('event: Dinner with Sam')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    await expect(dialog.getByRole('button', { name: /Mark (not )?done/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('button', { name: /Mark (not )?done: Dinner/ })).toHaveCount(0)
  })

  test('the type is only a layout: giving a task a start time makes it an event, and a due time is just as optional', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Write the report')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    expect((await taskNamed(page, 'Write the report'))?.kind).toBe('task')
    // the work day, with a start (an hour to work on it)
    await dialog.getByRole('button', { name: /No date/ }).first().click() // (the scheduled day)
    const pop = page.locator('div.fixed.z-\\[150\\]')
    const day = new Date(Date.now() + 2 * 86400_000).getDate()
    await pop.getByRole('button', { name: new RegExp(`^${day}$`) }).first().click()
    await expect.poll(async () => (await taskNamed(page, 'Write the report'))?.day).toBeTruthy()
    await dialog.getByText('–None–').first().click()
    await page.getByRole('listbox', { name: 'Hour' }).getByRole('option', { name: '3', exact: true }).nth(3).click()
    await page.getByRole('listbox', { name: 'AM or PM' }).getByRole('option', { name: 'PM' }).nth(3).click()
    await expect.poll(async () => (await taskNamed(page, 'Write the report'))?.time).toBeTruthy()
    await expect.poll(async () => (await taskNamed(page, 'Write the report'))?.kind).toBe('event')
    // Until's time is optional too, and says "Any time"
    await expect(dialog.getByText('Any time')).toBeVisible()
  })
})
