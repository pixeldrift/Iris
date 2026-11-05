import { expect, test, type Page } from '@playwright/test'

// Two people, two browsers, the local backend: an invitation, an acceptance, and what each side ends up with.
const stamp = Date.now()
const password = 'hunter2hunter2'

async function signUp(page: Page, name: string, email: string) {
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder(/Password/).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.locator('[aria-label^="Account"]')).toBeVisible()
}

test('inviting someone fills in their details once they accept, and nothing leaks before', async ({ browser }) => {
  test.setTimeout(60_000)
  const annEmail = `ann${stamp}@example.com`
  const bobEmail = `bob${stamp}@example.com`
  const ann = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  await signUp(ann, 'Ann Archer', annEmail)
  await signUp(bob, 'Bob Builder', bobEmail)

  // Ann adds a contact for Bob by his email and sends the invitation offered on saving
  await ann.getByRole('button', { name: /Address book/ }).first().click()
  await ann.getByRole('button', { name: 'Add a person' }).last().click()
  await ann.getByPlaceholder('First name').fill('Bobby')
  await ann.getByPlaceholder('Email').fill(bobEmail)
  await ann.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(ann.getByRole('heading', { name: /Invite Bobby to connect/ })).toBeVisible()
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  await expect(ann.getByText(/Invitation sent/)).toBeVisible()

  // the sender is not told anything more: still a plain, manual contact
  await expect(ann.getByRole('img', { name: 'Connected' })).toHaveCount(0)

  // Bob finds a request waiting under the avatar, and accepts
  await bob.reload()
  const account = bob.locator('[aria-label^="Account"]')
  await expect(account).toHaveAttribute('aria-label', /1 to look at/)
  await account.click()
  await bob.getByRole('button', { name: /Notifications/ }).click()
  await expect(bob.getByText('Ann Archer wants to connect')).toBeVisible()
  await bob.getByRole('button', { name: 'Review' }).click()
  await bob.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(bob.getByRole('heading', { name: /wants to connect/ })).toBeHidden()

  // Bob's address book has Ann, marked as connected
  await bob.getByRole('button', { name: /Address book/ }).first().click()
  await expect(bob.getByRole('button', { name: /^Ann Archer/ })).toBeVisible()
  await expect(bob.getByRole('img', { name: 'Connected' })).toBeVisible()

  // Ann's own entry for Bob is the one that is filled in (no second Bob), under his real name
  await ann.reload()
  await ann.getByRole('button', { name: /Address book/ }).first().click()
  await expect(ann.getByRole('button', { name: /^Bob Builder/ })).toBeVisible()
  await expect(ann.getByRole('button', { name: /^Bobby/ })).toHaveCount(0)
  await expect(ann.getByRole('img', { name: 'Connected' })).toHaveCount(1)
  await ann.getByRole('button', { name: /^Bob Builder/ }).click()
  await expect(ann.getByText('Connected', { exact: true })).toBeVisible()
  // the card is plain text; in the editor, what the connection keeps up to date can't be typed over
  await ann.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(ann.getByPlaceholder('Email')).toBeDisabled()

  // Ann has the news in a list she can delete from
  await ann.reload()
  await expect(ann.locator('[aria-label^="Account"]')).toHaveAttribute('aria-label', /1 to look at/)
  await ann.locator('[aria-label^="Account"]').click()
  await ann.getByRole('button', { name: /Notifications/ }).click()
  await expect(ann.getByRole('listitem').filter({ hasText: 'accepted your invitation' })).toHaveCount(1)
  await ann.getByRole('button', { name: /Delete notification/ }).click()
  await expect(ann.getByText('Nothing new.')).toBeVisible()
  await ann.getByRole('button', { name: 'Close', exact: true }).click()

  // when Bob deletes his account, Ann keeps the entry as an ordinary contact of hers
  await bob.locator('[aria-label^="Account"]').click()
  await bob.getByRole('button', { name: /My settings/ }).click()
  await bob.getByRole('button', { name: 'Delete account' }).click()
  await bob.getByLabel('Email').fill(bobEmail)
  await bob.getByLabel('Password').fill(password)
  await bob.getByRole('button', { name: 'Delete my account', exact: true }).click()
  await expect(bob.getByRole('button', { name: 'Close settings' })).toBeVisible()
  await ann.reload()
  await ann.getByRole('button', { name: /Address book/ }).first().click()
  await expect(ann.getByRole('button', { name: /^Bob Builder/ })).toBeVisible()
  await expect(ann.getByRole('img', { name: 'Connected' })).toHaveCount(0)
})
