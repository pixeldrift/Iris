import { expect, test } from '@playwright/test'
import { goto, open, taskNamed } from './helpers'

test.describe('quick add hints, tags and repeats', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
  })

  test('the box keeps its size when the type changes, and the hint does not repeat the type', async ({ page }) => {
    await page.keyboard.press('n')
    const box = page.locator('div.glass-strong').filter({ has: page.getByLabel('New item') }).first()
    const heights: number[] = []
    for (const k of ['Task', 'Event', 'Habit', 'List', 'Idea']) {
      await page.getByRole('radiogroup', { name: 'Type' }).getByRole('radio', { name: k }).click()
      heights.push(Math.round((await box.boundingBox())!.height))
    }
    expect(new Set(heights).size).toBe(1)
    await expect(page.getByText(/^Idea:/)).toHaveCount(0)
  })

  test('typing #li offers the group that exists, and Tab takes it', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Water the plants #lif')
    await expect(page.getByRole('option', { name: /#Life/ })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('New item')).toHaveValue('Water the plants #Life ')
  })

  test('tags added in the panel stay in the order they were added', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Ring about the garden')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    const add = dialog.getByLabel('Add tag')
    await add.fill('Grandma')
    await page.keyboard.press('Enter')
    await add.fill('Life')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await taskNamed(page, 'Ring about the garden'))?.tagOrder?.length).toBe(2)
    const t = (await taskNamed(page, 'Ring about the garden'))!
    expect(t.tagOrder![0]).toBe(t.personIds[0]) // (the person first, as added, though groups used to come first)
  })

  test('adding a repeat makes the task a habit', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Stretch')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    expect((await taskNamed(page, 'Stretch'))?.kind).toBe('task')
    await dialog.getByRole('button', { name: /^Repeat/ }).click()
    await dialog.getByRole('radio', { name: 'Daily' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Stretch'))?.kind).toBe('habit')
  })

  test('the default stages are Not started, In progress and Completed', async ({ page }) => {
    await goto(page, 'Progress')
    for (const n of ['Not started', 'In progress', 'Completed']) await expect(page.getByText(n, { exact: true }).first()).toBeVisible()
  })
})
