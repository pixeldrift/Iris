import { expect, test, type Page } from '@playwright/test'
import { goto, savedReady } from './helpers'

const iso = (plus: number) => {
  const d = new Date()
  d.setDate(d.getDate() + plus)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Pay rent is due tomorrow but its own urgency was left low. */
async function setUp(page: Page, auto: boolean) {
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await savedReady(page)
  await page.evaluate(([due, auto]) => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    const t = raw.state.tasks.find((x: { title: string }) => x.title === 'Pay rent')
    t.due = due
    t.day = null
    t.urgency = 0.1
    raw.state.settings.autoUrgency = auto
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
  }, [iso(1), auto] as const)
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await goto(page, 'List')
  await page.getByText('Pay rent', { exact: true }).first().click()
}

test.describe('auto urgency', () => {
  test('a dot under the slider shows the urgency in use, apart from where the slider was left', async ({ page }) => {
    await setUp(page, true)
    const dot = page.locator('[data-actual]')
    await expect(dot).toBeVisible()
    await expect(dot).toHaveAttribute('title', /In use: \d+% \(raised by the deadline\)/)
    // the slider itself keeps the value that was set
    const v = await page.getByRole('slider', { name: 'How urgent it is' }).inputValue()
    expect(Number(v)).toBeCloseTo(0.1, 1)
    await page.screenshot({ path: 'test-results/autourgency.png' })
  })

  test('switched off in the settings, there is no dot', async ({ page }) => {
    await setUp(page, false)
    await expect(page.getByRole('slider', { name: 'How urgent it is' })).toBeVisible()
    await expect(page.locator('[data-actual]')).toHaveCount(0)
  })

  test('the setting is in the settings', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-node]').first().waitFor()
    await page.getByRole('button', { name: 'My settings' }).click()
    await expect(page.getByRole('switch', { name: /Raise urgency near deadlines/ })).toHaveAttribute('aria-checked', 'true')
  })
})
