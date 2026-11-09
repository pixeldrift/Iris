import { expect, test } from '@playwright/test'
import { open } from './helpers'

test('a dialog holds focus (Tab stays inside), is read as a dialog, and gives focus back when it closes', async ({ page }) => {
  await open(page)
  const opener = page.getByRole('button', { name: 'My settings' })
  await opener.focus()
  await opener.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  await expect.poll(inside).toBe(true)
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await inside()).toBe(true)
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await inside()).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')).toMatch(/My settings/)
})

test('the new-item sheet is a dialog too: Tab stays in it, and focus returns to the New button', async ({ page }) => {
  await open(page)
  const opener = page.getByRole('button', { name: 'New task', exact: true })
  await opener.focus()
  await opener.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'New item' })
  await expect(dialog).toBeVisible()
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  await expect.poll(inside).toBe(true)
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await inside()).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toMatch(/New/)
})
