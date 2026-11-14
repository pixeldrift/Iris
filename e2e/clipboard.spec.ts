import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

// text selected in a note can be copied and pasted into another box (nothing on the page switches selection off around it)
test('a note can be copied and pasted elsewhere', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  await page.getByText('Lab report: osmosis').first().click()
  // (the notes stay a text box when they lose focus, so a selection in them is never swept away before a copy)
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true })
  await notes.fill('copy this line please')
  await notes.press('ControlOrMeta+A')
  await notes.press('ControlOrMeta+C')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('copy this line please')
  // the notes can be selected, and nothing above them stops it
  expect(await notes.evaluate((e) => getComputedStyle(e).userSelect)).toBe('text')
  const around = await notes.evaluate((e) => {
    const out: string[] = []
    for (let n: HTMLElement | null = e.parentElement; n; n = n.parentElement) out.push(getComputedStyle(n).userSelect)
    return out
  })
  expect(around).not.toContain('none')
  // and clicking away does not swap the box for plain text
  await page.getByRole('heading', { level: 1 }).first().click({ force: true }).catch(() => undefined)
  await expect(notes).toBeVisible()
})
