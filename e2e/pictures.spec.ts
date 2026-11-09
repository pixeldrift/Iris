import { expect, test } from '@playwright/test'
import { goto, open, saved, taskNamed } from './helpers'

// a small red PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=', 'base64')
const file = { name: 'red.png', mimeType: 'image/png', buffer: PNG }

test.describe('pictures on bubbles', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
  })


  test('a picture on any task fills its bubble, tinted unless switched off, and the title can be left out', async ({ page }) => {
    await goto(page, 'List')
    await page.keyboard.press('n')
    await page.keyboard.type('Frame the print')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    await page.waitForTimeout(900)
    await dialog.getByLabel('Choose a picture').setInputFiles(file)
    await expect.poll(async () => !!(await taskNamed(page, 'Frame the print'))?.image).toBe(true)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await goto(page, 'Pond')
    const bubble = page.locator('[data-node] .pad-photo').first()
    await expect(bubble).toBeVisible()
    await expect(bubble).not.toHaveClass(/untinted/)
    await goto(page, 'List')
    await page.getByText('Frame the print', { exact: true }).first().click()
    await dialog.getByRole('checkbox', { name: /Tint the picture/ }).uncheck()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await goto(page, 'Pond')
    await expect.poll(async () => (await taskNamed(page, 'Frame the print'))?.imageTint).toBe(false)
    await expect(page.locator('[data-node] .pad-photo.untinted').first()).toBeVisible()
    // removing it puts the bubble back
    await goto(page, 'List')
    await page.getByText('Frame the print', { exact: true }).first().click()
    await dialog.getByRole('button', { name: 'Remove the picture' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Frame the print'))?.image ?? null).toBeNull()
  })

  test('a photo alone makes an item, with no title', async ({ page }) => {
    await goto(page, 'List')
    const before = (await saved(page))!.tasks.length
    await page.keyboard.press('n')
    await page.getByLabel('Choose a photo').setInputFiles(file)
    await expect(page.getByRole('button', { name: 'Remove the picture' })).toBeVisible()
    await page.getByRole('button', { name: '+ Add' }).click()
    await expect.poll(async () => (await saved(page))!.tasks.length).toBe(before + 1)
    const made = (await saved(page))!.tasks.find((t) => t.image && !t.title)
    expect(made).toBeTruthy()
  })

  test('a task with a picture drops the type icon (its check box already says what it is); one without keeps it', async ({ page }) => {
    await goto(page, 'List')
    await page.keyboard.press('n')
    await page.keyboard.type('Snapshot task')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    await page.waitForTimeout(900)
    await dialog.getByLabel('Choose a picture').setInputFiles(file)
    await expect.poll(async () => !!(await taskNamed(page, 'Snapshot task'))?.image).toBe(true)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await goto(page, 'Pond')
    const withPicture = page.locator('[data-node]').filter({ has: page.locator('.pad-photo') }).first()
    await expect(withPicture).toBeVisible()
    await expect(withPicture.locator('[title="task"]')).toHaveCount(0)
    await expect(withPicture.getByRole('button', { name: /Mark done|Done this one/ })).toBeVisible()
    // a plain task bubble still shows its type icon
    await expect(page.locator('[data-node]:not(:has(.pad-photo)) [title="task"]').first()).toBeVisible()
  })
})
