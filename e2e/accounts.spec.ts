import { expect, test } from '@playwright/test'

// Runs against the local backend (a mock of Neon Auth + the real API on an in-memory database): see playwright.config.ts
test.describe('accounts', () => {
  const email = `tester${Date.now()}@example.com`
  const password = 'hunter2hunter2'

  test('sign up, clear everything and delete the account, each behind the email and password again', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-node]').first().waitFor()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.getByPlaceholder('Your name').fill('Test Person')
    await page.getByPlaceholder('Email').fill(email)
    await page.getByPlaceholder(/Password/).fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.locator('[aria-label^="Account"]')).toBeVisible()

    const state = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('lilac-v1')!).state; return [s.tasks.length, s.folders.length, s.people.length] })
    await expect.poll(async () => (await state())[0]).toBeGreaterThan(20)

    // clear: refused with a wrong password, allowed with the right one
    await page.locator('[aria-label^="Account"]').click()
    await page.getByRole('button', { name: /My settings/ }).click()
    await page.getByRole('button', { name: 'Clear everything…' }).click()
    const confirm = page.getByRole('button', { name: 'Clear everything', exact: true })
    await expect(confirm).toBeDisabled()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('not-the-password')
    await confirm.click()
    await expect(page.getByRole('alert')).toContainText('don’t match')
    expect((await state())[0]).toBeGreaterThan(20)
    await page.getByLabel('Password').fill(password)
    await confirm.click()
    await expect.poll(async () => (await state())[0]).toBe(0)

    // delete the account
    await page.getByRole('button', { name: 'Delete my account…' }).click()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Delete my account', exact: true }).click()
    await page.getByRole('button', { name: 'Close settings' }).click()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    // and the login no longer works
    await page.getByRole('button', { name: 'Sign in' }).click()
    const dialog = page.getByRole('dialog')
    await expect(async () => {
      // (the dialog clears its password field as it opens; fill until it sticks)
      await dialog.getByPlaceholder('Email').fill(email)
      await dialog.getByPlaceholder('Password').fill(password)
      await expect(dialog.getByPlaceholder('Password')).toHaveValue(password)
    }).toPass()
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
  })
})
