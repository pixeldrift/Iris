import { expect, test } from '@playwright/test'
import { goto, open, saved, taskNamed } from './helpers'

async function setMode(page: import('@playwright/test').Page, mode: 'auto' | 'suggest' | 'off') {
  await page.evaluate((m) => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    raw.state.settings.quickAdd = m
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
  }, mode)
  await page.reload()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await goto(page, 'List')
}

test.describe('quick add understanding', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
  })

  test('"Monday’s lesson plan" stays a plain title with no date', async ({ page }) => {
    await goto(page, 'List')
    await page.keyboard.press('n')
    await page.keyboard.type('prepare Monday’s lesson plan')
    await expect(page.getByLabel('New item')).toHaveValue('prepare Monday’s lesson plan')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await taskNamed(page, 'prepare Monday’s lesson plan'))?.kind).toBe('task')
    const t = (await taskNamed(page, 'prepare Monday’s lesson plan'))!
    expect(t.day ?? null).toBeNull()
    expect(t.due ?? null).toBeNull()
  })

  test('suggest-only offers what it understood and applies nothing until it is used', async ({ page }) => {
    await setMode(page, 'suggest')
    await page.keyboard.press('n')
    await page.keyboard.type('Dentist friday 2:30pm')
    await expect(page.getByText('Suggested:')).toBeVisible()
    await page.getByRole('button', { name: 'Use', exact: true }).click()
    await expect(page.getByText('Suggested:')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await saved(page))!.tasks.some((t) => t.title === 'Dentist' && t.time)).toBe(true)
  })

  test('suggest-only, not used: the words stay exactly as typed', async ({ page }) => {
    await setMode(page, 'suggest')
    await page.keyboard.press('n')
    await page.keyboard.type('Dentist friday 2:30pm')
    await page.keyboard.press('Enter')
    await expect.poll(async () => !!(await taskNamed(page, 'Dentist friday 2:30pm'))).toBe(true)
    expect((await taskNamed(page, 'Dentist friday 2:30pm'))!.time ?? null).toBeNull()
  })

  test('off: nothing is parsed or suggested', async ({ page }) => {
    await setMode(page, 'off')
    await page.keyboard.press('n')
    await page.keyboard.type('Dentist friday #Life')
    await expect(page.getByRole('option')).toHaveCount(0)
    await expect(page.getByText('Suggested:')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect.poll(async () => !!(await taskNamed(page, 'Dentist friday #Life'))).toBe(true)
    const t = (await taskNamed(page, 'Dentist friday #Life'))!
    expect(t.folderIds).toEqual([])
    expect(t.due ?? null).toBeNull()
  })

  test('the setting is in Settings', async ({ page }) => {
    await page.getByRole('button', { name: 'My settings' }).click()
    await page.getByRole('dialog').getByRole('radio', { name: 'Suggest' }).click()
    await expect.poll(async () => (await saved(page))!.settings.quickAdd).toBe('suggest')
  })
})
