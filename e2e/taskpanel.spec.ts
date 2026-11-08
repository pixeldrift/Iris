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
    const due = await y(/^Day/)
    const repeats = await y(/^Repeat/)
    const notes = (await dialog.getByLabel('Notes').boundingBox())!.y
    const sliders = (await dialog.getByRole('slider', { name: 'How much it matters' }).boundingBox())!.y
    expect(due).toBeLessThan(repeats)
    expect(repeats).toBeLessThan(notes)
    expect(notes).toBeLessThan(sliders)
    // the two sliders share a line
    const urgent = (await dialog.getByRole('slider', { name: 'How urgent it is' }).boundingBox())!.y
    expect(Math.abs(urgent - sliders)).toBeLessThan(6)
    // repeats are folded away until wanted, and do not say "Repeats" a second time inside
    await expect(dialog.getByRole('radiogroup', { name: 'Repeat' })).toHaveCount(0)
    await dialog.getByRole('button', { name: /^Repeat/ }).click()
    await expect(dialog.getByRole('radiogroup', { name: 'Repeat' })).toBeVisible()
    await expect(dialog.getByText(/^Repeat/)).toHaveCount(1)
  })

  test('setting the deadline brings a reminder with it, and a removed one stays removed', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Send the form')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    // "Deadline" is the date it is due by: a date, and a time that is optional
    await expect(dialog.getByText(/^Deadline/)).toBeVisible()
    await dialog.getByText(/^Deadline/).locator('xpath=..').getByRole('button').first().click()
    const day0 = new Date(Date.now() + 3 * 86400_000).getDate()
    await page.locator('div.fixed.z-\\[150\\]').getByRole('button', { name: new RegExp(`^${day0}$`) }).first().click()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.due).toBeTruthy()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.dueRemindAt).toBeTruthy() // (the morning of)
    expect((await taskNamed(page, 'Send the form'))?.dueRemindBefore).toBe(0)
    // taken away, it is not put back when the date changes
    await dialog.getByRole('button', { name: /Remove remind me/i }).click()
    await expect.poll(async () => (await taskNamed(page, 'Send the form'))?.dueRemindAt ?? null).toBeNull()
    await dialog.getByText(/^Deadline/).locator('xpath=..').getByRole('button').first().click()
    await page.locator('div.fixed.z-\\[150\\]').getByRole('button', { name: new RegExp(`^${new Date(Date.now() + 5 * 86400_000).getDate()}$`) }).first().click()
    await page.waitForTimeout(400)
    expect((await taskNamed(page, 'Send the form'))?.dueRemindAt ?? null).toBeNull()
  })

  test('every box folds away from its whole title row, and the stage sits under the progress slider, below the notes', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Fold me')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    await page.waitForTimeout(800) // (the panel slides in)
    const where = dialog.getByRole('region', { name: 'Where' })
    await expect(where.getByRole('textbox', { name: 'Where' })).toBeVisible()
    // anywhere along the title row works (here, the far right where the arrow is)
    const head = (await where.getByRole('button').first().boundingBox())!
    await page.mouse.click(head.x + head.width - 4, head.y + head.height / 2)
    await expect(where.getByRole('textbox', { name: 'Where' })).toHaveCount(0)
    await where.getByRole('button', { name: 'Where' }).click()
    await expect(where.getByRole('textbox', { name: 'Where' })).toBeVisible()
    // order: notes, then progress with its stage right under the slider, then priority
    const y = async (l: import('@playwright/test').Locator) => (await l.boundingBox())!.y
    const notes = await y(dialog.getByLabel('Notes'))
    const slider = await y(dialog.getByRole('slider', { name: 'Progress' }))
    const stage = await y(dialog.getByRole('button', { name: 'Not started' }))
    const priority = await y(dialog.getByRole('slider', { name: 'How much it matters' }))
    expect(notes).toBeLessThan(slider)
    expect(slider).toBeLessThan(stage)
    expect(stage).toBeLessThan(priority)
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
    for (const gone of [/^Day/, /^Deadline/, /Remind me/, /Repeat/, /Importance/, /Urgency/, /Stage/, /Assigned to/]) await expect(dialog.getByText(gone)).toHaveCount(0)
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
    // The deadline's time is optional too, and says "Any time"
    await expect(dialog.getByText('Any time')).toBeVisible()
  })
})
