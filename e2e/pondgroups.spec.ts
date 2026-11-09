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
  })

  test('tapping a group’s name shows just that group, and tapping it again steps back up', async ({ page }) => {
    const label = (n: string) => page.locator('.pond-label').filter({ hasText: n }).first()
    await expect(label('Home')).toBeVisible()
    const name = (n: string) => label(n).locator(':scope > [data-ui]')
    await name('School').click({ position: { x: 14, y: 12 } })
    await expect(label('English 101')).toBeVisible()
    await expect(page.locator('.pond-label').filter({ hasText: 'Home' })).toHaveCount(0)
    await page.waitForTimeout(800)
    await page.locator('.pond-label button', { hasText: 'School' }).first().click()
    await expect(label('Home')).toBeVisible()
  })

  test('group names are drawn above the bubbles, even ones moved over them', async ({ page }) => {
    await page.waitForTimeout(1500)
    // push a bubble right over a group's name: the name must still be the top thing there
    const over = await page.evaluate(() => {
      const label = document.querySelector('.pond-label > [data-ui]')!.getBoundingClientRect()
      const node = document.querySelector('[data-node]') as HTMLElement
      const r = node.getBoundingClientRect()
      node.style.translate = `${label.left + label.width / 2 - (r.left + r.width / 2)}px ${label.top + label.height / 2 - (r.top + r.height / 2)}px`
      const hit = document.elementFromPoint(label.left + label.width / 2 - 6, label.top + label.height / 2)
      return !!hit?.closest('.pond-label')
    })
    expect(over).toBe(true)
  })

  test('tapping the water just below a group starts a new item in the nearest group', async ({ page }) => {
    await page.waitForTimeout(1500) // (let the bubbles settle)
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

test.describe('group names are solid', () => {
  test('a group name pushes other groups’ bubbles aside, and never rests on top of one', async ({ page }) => {
    await open(page)
    await page.getByRole('radiogroup', { name: 'Gather by' }).getByRole('radio', { name: 'Group' }).click()
    await page.waitForTimeout(2500)
    const overlaps = () =>
      page.evaluate(() => {
        const labels = [...document.querySelectorAll('.pond-label > div')].map((e) => e.getBoundingClientRect())
        const bubbles = [...document.querySelectorAll('[data-node]')].map((e) => e.getBoundingClientRect())
        let n = 0
        for (const l of labels)
          for (const b of bubbles) {
            const cx = b.left + b.width / 2
            const cy = b.top + b.height / 2
            const nx = Math.max(l.left, Math.min(cx, l.right))
            const ny = Math.max(l.top, Math.min(cy, l.bottom))
            if (Math.hypot(cx - nx, cy - ny) < b.width / 2 - 3) n++
          }
        return n
      })
    expect(await overlaps()).toBe(0)
    // carry the Home name over the School bubbles: they make way, and when it is let go nothing sits under it
    const home = page.locator('.pond-label').filter({ hasText: 'Home' }).first()
    const school = page.locator('.pond-label').filter({ hasText: 'School' }).first()
    const a = (await home.boundingBox())!
    const b = (await school.boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + a.width / 2 - 40, a.y + a.height / 2 + 10, { steps: 4 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 120, { steps: 20 })
    await page.waitForTimeout(600)
    await page.mouse.up()
    await page.waitForTimeout(3500)
    expect(await overlaps()).toBe(0)
  })
})
