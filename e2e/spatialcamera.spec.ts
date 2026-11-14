import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

// a fake camera (Chromium's test pattern), allowed up front
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

const intro = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Spatial workspace' })

async function enter(page: import('@playwright/test').Page) {
  await open(page)
  await goto(page, 'Spatial')
  await page.getByRole('button', { name: 'Use touch only' }).click()
}

test.describe('camera background', () => {
  test('shows the camera behind the tasks only when asked, and lets go of it when switched back or on exit', async ({ page }) => {
    await enter(page)
    await expect(intro(page).locator('video')).toHaveCount(0) // (never started by itself)
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    await page.getByRole('radio', { name: 'Camera' }).click()
    await expect(intro(page).locator('video')).toHaveCount(1)
    await expect(page.getByText('Camera · Touch navigation', { exact: true })).toBeVisible()
    const live = () => page.evaluate(() => (document.querySelector('video')?.srcObject as MediaStream | null)?.getTracks().some((t) => t.readyState === 'live') ?? false)
    expect(await live()).toBe(true)
    // back to the virtual room: the camera's tracks are stopped
    const stream = await page.evaluateHandle(() => document.querySelector('video')!.srcObject as MediaStream)
    await page.getByRole('radiogroup', { name: 'Background' }).getByRole('radio', { name: 'Virtual' }).click()
    await expect(intro(page).locator('video')).toHaveCount(0)
    await expect.poll(() => stream.evaluate((s) => (s as MediaStream).getTracks().every((t) => t.readyState === 'ended'))).toBe(true)
    // and leaving while it is on stops it too
    await page.getByRole('radio', { name: 'Camera' }).click()
    await expect(intro(page).locator('video')).toHaveCount(1)
    const s2 = await page.evaluateHandle(() => document.querySelector('video')!.srcObject as MediaStream)
    await page.locator('button', { hasText: /^Pond/ }).first().click()
    await expect.poll(() => s2.evaluate((s) => (s as MediaStream).getTracks().every((t) => t.readyState === 'ended'))).toBe(true)
  })
})

test.describe('camera denied', () => {
  test('falls back to the virtual room with a note, and the workspace still works', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError'))
    })
    await enter(page)
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    await page.getByRole('radio', { name: 'Camera' }).click()
    await expect(page.getByText(/camera was not available/)).toBeVisible()
    await expect(page.getByRole('radiogroup', { name: 'Background' }).getByRole('radio', { name: 'Virtual' })).toBeChecked()
    await expect(intro(page).locator('canvas')).toBeVisible()
  })
})
