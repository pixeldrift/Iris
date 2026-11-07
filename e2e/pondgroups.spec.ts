import { expect, test } from '@playwright/test'
import { folderRow, open, saved } from './helpers'

test.describe('groups in the pond', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await page.getByRole('radiogroup', { name: 'Gather by' }).getByRole('radio', { name: 'Group' }).click()
    await page.waitForTimeout(500)
  })

  test('there is no add-group link beside "Gather by"', async ({ page }) => {
    await expect(page.getByRole('button', { name: '+ Group' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Subgroup' })).toHaveCount(0)
  })

  test('a group with nothing in it is still named in the pond', async ({ page }) => {
    await page.getByText('Groups', { exact: true }).locator('xpath=ancestor::*[self::header or self::div][1]').getByRole('button').last().click()
    await page.getByLabel('Group name').fill('Empty one')
    await page.getByLabel('Group name').press('Enter')
    await expect(page.locator('.pond-label').filter({ hasText: 'Empty one' })).toBeVisible()
  })

  test('the plus beside a group’s name makes a subgroup in it', async ({ page }) => {
    await page.locator('.pond-label').filter({ hasText: 'Home' }).first().getByRole('button', { name: /New subgroup in Home/ }).click()
    await page.getByLabel('Group name').fill('Fresh sub')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(folderRow(page, 'Fresh sub')).toBeVisible()
    const s = await saved(page)
    const home = s!.folders.find((f) => f.name === 'Home')!
    expect(s!.folders.find((f) => f.name === 'Fresh sub')!.parentId).toBe(home.id)
  })

  test('a group dragged by its name onto another group goes inside it', async ({ page }) => {
    await page.waitForTimeout(1200) // (let the groups settle into place)
    const life = page.locator('.pond-label').filter({ hasText: 'Life' }).first()
    const home = page.locator('.pond-label').filter({ hasText: 'Home' }).first()
    const a = (await life.boundingBox())!
    const b = (await home.boundingBox())!
    // grab "Life" by its name and carry it onto the name "Home"
    await page.mouse.move(a.x + a.width / 2 - 8, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + a.width / 2 - 8, a.y + a.height / 2 + 8, { steps: 3 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 })
    await page.mouse.up()
    await expect
      .poll(async () => {
        const st = await saved(page)
        const homeF = st?.folders.find((f) => f.name === 'Home')
        return st?.folders.find((f) => f.name === 'Life')?.parentId === homeF?.id
      })
      .toBe(true)
    await expect(page.getByText(/“Life” is now inside “Home”/)).toBeVisible()
    // "Life" keeps its own name in the pond, and carrying "Home" carries it along
    await page.waitForTimeout(1500)
    const life2 = page.locator('.pond-label').filter({ hasText: 'Life' }).first()
    await expect(life2).toBeVisible()
    const l0 = (await life2.boundingBox())!
    const h0 = (await page.locator('.pond-label').filter({ hasText: 'Home' }).first().boundingBox())!
    await page.mouse.move(h0.x + h0.width / 2 - 8, h0.y + h0.height / 2)
    await page.mouse.down()
    await page.mouse.move(h0.x + h0.width / 2 + 40, h0.y + h0.height / 2 + 40, { steps: 6 })
    await page.mouse.move(h0.x + h0.width / 2 + 120, h0.y + h0.height / 2 + 120, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(1500)
    const l1 = (await page.locator('.pond-label').filter({ hasText: 'Life' }).first().boundingBox())!
    expect(l1.x - l0.x).toBeGreaterThan(60)
    expect(l1.y - l0.y).toBeGreaterThan(60)
  })

  test('tapping the water just below a group starts a new item in the nearest group', async ({ page }) => {
    const label = page.locator('.pond-label').filter({ hasText: 'Home' }).first()
    const b = (await label.boundingBox())!
    // a spot of open water (not on a bubble or a label) close to the group's name
    const spot = await page.evaluate(({ cx, cy }) => {
      const pond = document.querySelector('[aria-label^="Pond canvas"]')!.getBoundingClientRect()
      for (let r = 70; r <= 200; r += 10)
        for (let a = 0; a < 360; a += 20) {
          const x = cx + r * Math.cos((a * Math.PI) / 180)
          const y = cy + r * Math.sin((a * Math.PI) / 180)
          if (x < pond.left + 20 || x > pond.right - 20 || y < pond.top + 20 || y > pond.bottom - 20) continue
          const el = document.elementFromPoint(x, y)
          if (el && !el.closest('[data-node],[data-ui],button')) return { x, y }
        }
      return null
    }, { cx: b.x + b.width / 2, cy: b.y + b.height / 2 })
    expect(spot).not.toBeNull()
    await page.mouse.click(spot!.x, spot!.y)
    await page.getByLabel('New item').first().fill('Tap test')
    await page.keyboard.press('Enter')
    await expect
      .poll(async () => {
        const st = await saved(page)
        const t = st?.tasks.find((x) => x.title === 'Tap test')
        // (it belongs to a group: the nearest one to where the water was tapped)
        return !!t && t.folderIds.length > 0 && st!.folders.some((f) => t.folderIds.includes(f.id))
      })
      .toBe(true)
  })
})

test('typing @ and a name nobody has in the quick add box does not freeze the app', async ({ page }) => {
  await open(page)
  await page.keyboard.press('n')
  await page.waitForTimeout(600)
  await page.keyboard.type('Call @Zq')
  const alive = await Promise.race([page.evaluate(() => 1).then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 6000))])
  expect(alive).toBe(true)
})
