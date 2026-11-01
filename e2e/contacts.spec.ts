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
    // it opens as a card of plain text, and Edit turns it into the form
    await page.getByRole('button', { name: /^Pia/ }).click()
    await expect(page.getByRole('heading', { name: 'Pia' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Edit contact' })).toHaveCount(0)
    await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Edit contact' })).toBeVisible()
  })

  test('the calendar month shows dots, not words', async ({ page }) => {
    await page.locator('button', { hasText: /^Calendar/ }).first().click()
    await expect(page.getByRole('button', { name: /items? on / }).first()).toBeVisible()
    // a day's box holds its number and its dots, no titles
    const day = page.getByRole('button', { name: /items? on / }).first().locator('..')
    expect((await day.innerText()).trim()).toMatch(/^\d+$/)
  })

  test('a birthday can be typed, with the year optional, and sits beside the company', async ({ page }) => {
    await page.getByRole('button', { name: /Address book/ }).first().click()
    await page.getByRole('button', { name: 'Add a person' }).last().click()
    await page.getByPlaceholder('First name').fill('Bea')
    const b = page.getByLabel('Birthday', { exact: true })
    await b.fill('march 4th')
    await page.getByLabel('Company').fill('Acme')
    await expect(b).toHaveValue('Mar 4') // read and written back in the chosen style, no year
    await b.fill('4/5/1990')
    await page.getByLabel('Company').click()
    await expect(b).toHaveValue('Apr 5, 1990') // month first, with its year
    await b.fill('someday')
    await page.getByLabel('Company').click()
    await expect(page.getByRole('alert')).toContainText('Try')
    await b.fill('Mar 4')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/Acme · .*Birthday Mar 4/)).toBeVisible()
  })

  test('on a desktop the search and the categories share a line', async ({ page }) => {
    await page.getByRole('button', { name: /Address book/ }).first().click()
    const s = (await page.getByLabel('Search people').boundingBox())!
    const c = (await page.getByRole('radiogroup', { name: 'Category' }).boundingBox())!
    expect(Math.abs(s.y - c.y)).toBeLessThan(12)
    expect(s.width).toBeLessThan(300)
  })

  test('a contact card shows phone and email as links, with company and birthday as plain text', async ({ page }) => {
    await page.getByRole('button', { name: /Address book/ }).first().click()
    await page.getByRole('button', { name: 'Add a person' }).last().click()
    await page.getByPlaceholder('First name').fill('Cleo')
    await page.getByPlaceholder('Phone').fill('8085550142')
    await page.getByPlaceholder('Email').fill('cleo@example.com')
    await page.getByLabel('Company').fill('Reef Labs')
    await page.getByLabel('Birthday', { exact: true }).fill('Mar 4')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: /^Cleo/ }).first().click()
    const card = page.getByRole('dialog')
    await expect(card.getByRole('link', { name: /555.?0142/ })).toHaveAttribute('href', /^tel:\+?8085550142$/)
    await expect(card.getByRole('link', { name: 'cleo@example.com' })).toHaveAttribute('href', 'mailto:cleo@example.com')
    await expect(card.getByText('Reef Labs')).toBeVisible()
    await expect(card.getByText('Mar 4')).toBeVisible()
    // Cancel in the editor goes back to the card rather than closing
    await card.getByRole('button', { name: 'Edit', exact: true }).click()
    await card.getByRole('button', { name: 'Cancel' }).click()
    await expect(card.getByRole('link', { name: 'cleo@example.com' })).toBeVisible()
  })
})
