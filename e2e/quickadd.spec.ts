import { expect, test } from '@playwright/test'
import { open, taskNamed } from './helpers'

test.describe('closing the quick add box', () => {
  test.beforeEach(({ page }) => open(page))

  test('clicking away keeps an item that has a name, and offers Undo', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Pick up the parcel')
    await page.mouse.click(1100, 700) // the background
    await expect(page.getByLabel('New item')).toHaveCount(0)
    await expect.poll(async () => !!(await taskNamed(page, 'Pick up the parcel'))).toBe(true)
    await expect(page.getByRole('status')).toContainText('Added “Pick up the parcel”')
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click() // (the toast's; the top bar has an Undo too)
    await expect.poll(async () => !!(await taskNamed(page, 'Pick up the parcel'))).toBe(false)
  })

  test('clicking away also keeps an item opened with more details', async ({ page }) => {
    await page.keyboard.press('n')
    await page.keyboard.type('Book the vet')
    await page.getByRole('button', { name: 'More details' }).click()
    await page.mouse.click(1100, 780)
    await expect.poll(async () => !!(await taskNamed(page, 'Book the vet'))).toBe(true)
  })

  test('with no name it just closes, and Escape, the close button and Cancel throw an item away', async ({ page }) => {
    await page.keyboard.press('n')
    await page.mouse.click(1100, 700)
    await expect(page.getByLabel('New item')).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveCount(0)
    await page.keyboard.press('n')
    await page.keyboard.type('Escaped away')
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('New item')).toHaveCount(0)
    expect(await taskNamed(page, 'Escaped away')).toBeFalsy()
    await page.keyboard.press('n')
    await page.keyboard.type('Never mind this')
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByLabel('New item')).toHaveCount(0)
    expect(await taskNamed(page, 'Never mind this')).toBeFalsy()
    await page.keyboard.press('n')
    await page.keyboard.type('Nor this')
    await page.getByRole('button', { name: 'More details' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(await taskNamed(page, 'Nor this')).toBeFalsy()
  })
})
