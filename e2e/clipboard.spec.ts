import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test.describe('notes', () => {
  test('are plain text once written, can be edited by tapping them, and have a Copy button', async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    await page.getByText('Lab report: osmosis').first().click()
    const box = page.getByRole('textbox', { name: 'Notes', exact: true })
    await box.fill('copy this line please')
    // leaving the box makes them plain text
    await box.press('Tab')
    await expect(box).toHaveCount(0)
    const plain = page.getByLabel('Task details').getByText('copy this line please', { exact: true })
    await expect(plain).toBeVisible()
    // the Copy button puts them on the clipboard
    await page.getByRole('button', { name: 'Copy notes' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('copy this line please')
    // tapping the text edits it again
    await plain.click()
    await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toBeFocused()
  })
})
