import { expect, test, type Page } from '@playwright/test'
import { goto, open } from './helpers'

/** Every visible text box, with how it is named. A box with no name has no label for the typing bar (or a screen reader) to use. */
const unnamed = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
      .filter((e) => !['checkbox', 'radio', 'range', 'file', 'hidden'].includes((e as HTMLInputElement).type) && e.getClientRects().length > 0 && !e.closest('[data-input-proxy]'))
      .filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('data-field-label') || e.labels?.[0]?.textContent?.trim()))
      .map((e) => `${e.tagName.toLowerCase()} "${e.placeholder}"`),
  )

test.describe('every text box has a name', () => {
  test.beforeEach(({ page }) => open(page))

  test('quick add, in every kind, and its details', async ({ page }) => {
    await page.keyboard.press('n')
    expect(await unnamed(page)).toEqual([])
    await page.getByRole('button', { name: 'More details' }).click()
    for (const k of ['Task', 'Event', 'Habit', 'List', 'Notion']) {
      await page.getByRole('radio', { name: k, exact: true }).click()
      expect(await unnamed(page), k).toEqual([])
    }
  })

  test('a contact, and the list and board quick-add lines', async ({ page }) => {
    await page.locator('button', { hasText: /^Address book/ }).first().click()
    expect(await unnamed(page)).toEqual([])
    await page.getByRole('button', { name: 'Add a person' }).last().click()
    for (const t of ['+ Phone', '+ Email', '+ Address', '+ Website']) {
      const add = page.getByRole('button', { name: t })
      if (await add.count()) await add.first().click()
    }
    expect(await unnamed(page)).toEqual([])
    await page.keyboard.press('Escape')
    await goto(page, 'List')
    expect(await unnamed(page)).toEqual([])
    await goto(page, 'Progress')
    expect(await unnamed(page)).toEqual([])
  })

  test('an item opened for details', async ({ page }) => {
    await goto(page, 'List')
    await page.locator('[data-lift-id^="task:"]').first().click()
    await expect(page.locator('section[aria-label="Task details"]')).toBeVisible()
    expect(await unnamed(page)).toEqual([])
  })
})
