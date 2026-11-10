import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

// text selected in a note can be copied and pasted into another box (nothing on the page switches selection off around it)
test('a note can be copied and pasted elsewhere', async ({ page }) => {
  await open(page)
  await goto(page, 'List')
  await page.getByText('Lab report: osmosis').first().click()
  const notes = page.getByLabel('Notes').first()
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
})
