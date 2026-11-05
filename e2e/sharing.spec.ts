import { expect, test, type Page } from '@playwright/test'

// Two people, two browsers, the local backend: share a group, join it, be given a task, and be removed again.
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

const row = (page: Page, name: string) => page.locator('[data-folder-row]').filter({ hasText: name }).first()

test('sharing a group: invite a connection, they join and are given a task, then they are removed', async ({ browser }) => {
  test.setTimeout(150_000)
  const annEmail = `sann${stamp}@example.com`
  const bobEmail = `sbob${stamp}@example.com`
  const ann = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
  const bob = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
  await signUp(ann, 'Ann Archer', annEmail)
  await signUp(bob, 'Bob Builder', bobEmail)

  // they connect first (Ann invites Bob's email; Bob accepts)
  await ann.getByRole('button', { name: /Address book/ }).first().click()
  await ann.getByRole('button', { name: 'Add a person' }).last().click()
  await ann.getByPlaceholder('First name').fill('Bobby')
  await ann.getByPlaceholder('Email').fill(bobEmail)
  await ann.getByRole('button', { name: 'Save', exact: true }).click()
  await ann.getByRole('button', { name: 'Send invitation' }).click()
  await bob.reload()
  await bob.locator('[aria-label^="Account"]').click()
  await bob.getByRole('button', { name: /Notifications/ }).click()
  await bob.getByRole('button', { name: 'Review' }).click()
  await bob.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(bob.getByRole('heading', { name: /wants to connect/ })).toBeHidden()
  await ann.reload()

  // Ann makes a group with a task in it, and shares it
  await ann.locator('button[title], button').filter({ has: ann.locator('svg') }).first() // (no-op: keeps the page settled)
  await ann.getByText('Groups', { exact: true }).locator('xpath=ancestor::*[self::header or self::div][1]').getByRole('button').last().click()
  await ann.getByLabel('Group name').fill('Trip planning')
  await ann.getByLabel('Group name').press('Enter')
  await row(ann, 'Trip planning').click()
  await ann.keyboard.press('n')
  await ann.keyboard.type('Book flights')
  await ann.keyboard.press('Enter')
  await expect(ann.getByText('Book flights').first()).toBeVisible()
  await row(ann, 'Trip planning').locator('button[aria-haspopup=dialog]').click()
  await ann.getByRole('button', { name: 'Share', exact: true }).click()
  await ann.getByRole('button', { name: 'Share this group' }).click()
  await expect(ann.getByRole('list', { name: 'Members' })).toBeVisible()
  await ann.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(ann.getByText('1 waiting')).toBeVisible()
  await ann.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(row(ann, 'Trip planning').getByRole('img', { name: 'Shared group' })).toBeVisible()

  // Bob is invited, joins, and sees the group and its task
  await bob.reload()
  await bob.locator('[aria-label^="Account"]').click()
  await bob.getByRole('button', { name: /Notifications/ }).click()
  await expect(bob.getByText(/invited you to share “Trip planning”/)).toBeVisible()
  await bob.getByRole('button', { name: 'Join' }).click()
  await bob.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(row(bob, 'Trip planning')).toBeVisible({ timeout: 20_000 })
  await row(bob, 'Trip planning').click()
  await expect(bob.getByText('Book flights').first()).toBeVisible({ timeout: 20_000 })

  // Bob is given the task (any member can be picked), and Ann is told nothing here but Bob is told when Ann gives it
  await bob.getByText('Book flights').first().click({ force: true }) // (a drifting bubble is never still)
  await expect(bob.getByLabel('Assigned to')).toBeVisible()
  await bob.getByLabel('Assigned to').selectOption({ label: 'Me' })
  await expect(bob.getByLabel('Assigned to')).not.toHaveValue('')
  await bob.keyboard.press('Escape')

  // Ann removes Bob with no copy: the group is gone from his side
  await row(ann, 'Trip planning').locator('button[aria-haspopup=dialog]').click()
  await ann.getByRole('button', { name: 'Sharing' }).click()
  await ann.getByRole('button', { name: 'Remove', exact: true }).click()
  await ann.getByRole('button', { name: 'Remove, no copy' }).click()
  await bob.reload()
  await expect(row(bob, 'Trip planning')).toHaveCount(0, { timeout: 20_000 })
})
