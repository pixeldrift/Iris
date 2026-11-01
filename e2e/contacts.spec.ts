import { expect, test } from '@playwright/test'
import { open } from './helpers'

// a 1x1 pixel PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test.describe('the address book', () => {
  test.beforeEach(({ page }) => open(page))

  test('a contact can have a portrait, and a small book has no A–Z headings', async ({ page }) => {
    await page.getByRole('button', { name: /Address book/ }).first().click()
    await expect(page.getByRole('heading', { name: 'Address book' })).toBeVisible()
    // four people: nothing to find by letter
    await expect(page.locator('main section h3')).toHaveCount(0)
    // no second "add" beside the people's own add button
    await expect(page.getByRole('button', { name: 'New task' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Add a person' }).last().click()
    await page.getByPlaceholder('First name').fill('Pia')
    await page.getByLabel('Choose a photo').setInputFiles({ name: 'pia.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByRole('dialog').locator('img')).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Pia/ }).locator('img')).toBeVisible()
    // and it opens as "Edit contact"
    await page.getByRole('button', { name: /^Pia/ }).click()
    await expect(page.getByRole('heading', { name: 'Edit contact' })).toBeVisible()
  })

  test('the calendar month shows dots, not words', async ({ page }) => {
    await page.locator('button', { hasText: /^Calendar/ }).first().click()
    await expect(page.getByRole('button', { name: /items? on / }).first()).toBeVisible()
    // a day's box holds its number and its dots, no titles
    const day = page.getByRole('button', { name: /items? on / }).first().locator('..')
    expect((await day.innerText()).trim()).toMatch(/^\d+$/)
  })
})
