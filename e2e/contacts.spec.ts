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
    await expect(page.getByRole('img', { name: /items? on / }).first()).toBeVisible()
    // a day's box holds its number and its dots, no titles
    const day = page.getByRole('img', { name: /items? on / }).first().locator('..')
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

  test('tapping a day in the month view opens it, with list-style items and arrows to the next day', async ({ page }) => {
    await page.locator('button', { hasText: /^Calendar/ }).first().click()
    await page.getByRole('img', { name: /items? on / }).first().locator('..').click() // the first day with something on it
    const day = page.getByRole('dialog')
    await expect(day.getByRole('heading')).toContainText(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/)
    const before = await day.getByRole('heading').innerText()
    // items carry a checkbox (left) and their type (right), like the list view
    await expect(day.getByRole('button', { name: /Mark done|Done this one/ }).first()).toBeVisible()
    await day.getByRole('button', { name: 'Next day' }).click()
    await expect(day.getByRole('heading')).not.toHaveText(before)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('the calendar has the view toggle first, a briefcase for business days (none on a single day), and the rolling options live in settings', async ({ page }) => {
    await page.locator('button', { hasText: /^Calendar/ }).first().click()
    const mode = page.getByRole('button', { name: 'month', exact: true })
    const business = page.getByRole('button', { name: 'Business days only' })
    expect((await mode.boundingBox())!.x).toBeLessThan((await business.boundingBox())!.x)
    // no rolling toggle in the calendar itself
    await expect(page.getByRole('radio', { name: 'Next 30 days' })).toHaveCount(0)
    // business days only: the weekend columns go
    const cols = () => page.locator('main [data-drop^="day:"]').count()
    const full = await cols()
    await business.click()
    expect(await cols()).toBeLessThan(full)
    await business.click()
    // the month has only the weeks it needs
    expect(full % 7).toBe(0)
    expect(full).toBeLessThanOrEqual(42)
    await page.getByRole('button', { name: 'day', exact: true }).click()
    await expect(business).toHaveCount(0)
    // settings: the next 30 days / next 7 days
    await page.getByRole('button', { name: 'My settings' }).first().click()
    await page.getByRole('radio', { name: 'Next 30 days' }).click()
    await page.getByRole('radio', { name: 'Next 7 days' }).click()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await page.getByRole('button', { name: 'week', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Next 7 days' })).toBeVisible()
    await page.getByRole('button', { name: 'month', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Next 30 days' })).toBeVisible()
  })

  test('closing an item opened from a day popup brings the day back, and today, tomorrow and yesterday are named', async ({ page }) => {
    await page.locator('button', { hasText: /^Calendar/ }).first().click()
    await page.getByRole('img', { name: /items? on / }).first().locator('..').click() // the first day with something on it
    const day = page.getByRole('dialog')
    await day.getByRole('button', { name: /Mark done|Done this one/ }).first().waitFor()
    await day.locator('.tint').first().click()
    await expect(page.getByRole('dialog', { name: /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Close' }).first().click()
    await expect(page.getByRole('dialog', { name: /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/ })).toBeVisible()
  })
})
