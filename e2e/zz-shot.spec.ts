import { test } from '@playwright/test'
import { open } from './helpers'
test('at', async ({ page }) => {
  test.setTimeout(40_000)
  await open(page)
  await page.keyboard.press('n')
  await page.waitForTimeout(600)
  await page.keyboard.type('Call ')
  await page.keyboard.type('@')
  const t0 = Date.now()
  const alive = await Promise.race([page.evaluate(() => 1).then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))])
  console.log('ALIVE', alive, Date.now() - t0)
  await page.keyboard.type('Gra')
  const alive2 = await Promise.race([page.evaluate(() => 1).then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))])
  console.log('ALIVE2', alive2)
})
