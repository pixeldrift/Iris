import { expect, test } from '@playwright/test'
import { goto, open, saved } from './helpers'

test.use({ viewport: { width: 1300, height: 900 } })

/** Study group is in Life (given first), Writing and School, with the tags in the order Life, School, Writing. */
async function setUp(page: import('@playwright/test').Page, view = 'List') {
  await open(page)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
    const t = raw.state.tasks.find((x: { title: string }) => x.title === 'Study group')
    t.folderIds = ['life', 'demo-writing', 'school']
    t.tagOrder = ['life', 'school', 'demo-writing']
    localStorage.setItem('lilac-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.locator('[data-node]').first().waitFor()
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
  await goto(page, view)
}
const hueOf = async (page: import('@playwright/test').Page, id: string) => ((await saved(page))!.folders.find((f) => f.id === id)!.hue as number)
const row = (page: import('@playwright/test').Page) => page.locator('[data-lift-id^="task:"]').filter({ hasText: 'Study group' }).first()

test.describe('an item in several groups', () => {
  test('wears the colour of the group it was given first, with a dot for each of the others in tag order', async ({ page }) => {
    await setUp(page)
    const life = await hueOf(page, 'life')
    await expect(row(page)).toHaveCSS('--h', String(life))
    const dots = row(page).locator('.group-dots i')
    await expect(dots).toHaveCount(2)
    // the others, in the order of its tags: School, then Writing
    expect(await dots.evaluateAll((els) => els.map((e) => e.getAttribute('title')))).toEqual(['School', 'Writing'])
    // the second and third groups also tint it softly
    await expect(row(page)).toHaveCSS('--on2', '1')
  })

  test('while a group is being viewed, that group\'s colour comes first', async ({ page }) => {
    await setUp(page)
    await page.locator('[data-folder-row]').filter({ hasText: 'Writing' }).first().click()
    await page.waitForTimeout(600)
    const writing = await hueOf(page, 'demo-writing')
    const r = row(page)
    await expect(r).toHaveCSS('--h', String(writing))
    // Life, given first, is now one of the dots
    expect(await r.locator('.group-dots i').evaluateAll((els) => els.map((e) => e.getAttribute('title')))).toContain('Life')
  })
})

test.describe('clicking a group tag in the details', () => {
  test('rings the item in the list, in the group\'s colour', async ({ page }) => {
    await setUp(page)
    await row(page).click()
    await page.getByLabel('Task details').waitFor()
    await page.waitForTimeout(500)
    const chip = page.locator('[data-tag-chip="school"]')
    await chip.scrollIntoViewIfNeeded()
    const b = (await chip.boundingBox())!
    await page.mouse.click(b.x + 12, b.y + b.height / 2)
    await expect(page.locator('.tag-landed').first()).toBeVisible({ timeout: 3000 })
  })

  test('in the flat canvas it slides to that group', async ({ page }) => {
    await setUp(page, 'Spatial')
    await page.locator('[data-task]').first().waitFor()
    const view = () => page.locator('[aria-label^="Your tasks by group"] > div.absolute.left-0.top-0').first().evaluate((el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return { k: m.a, x: m.e, y: m.f } })
    await page.getByRole('region', { name: 'Spatial workspace' }).locator('[data-task="demo-study"] button.truncate').click()
    await page.getByLabel('Task details').waitFor()
    await page.waitForTimeout(500)
    const before = await view()
    const chip = page.locator('[data-tag-chip="demo-writing"]')
    await chip.scrollIntoViewIfNeeded()
    const b = (await chip.boundingBox())!
    await page.mouse.click(b.x + 12, b.y + b.height / 2)
    await page.waitForTimeout(900)
    const after = await view()
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y) + Math.abs(after.k - before.k)).toBeGreaterThan(4)
  })
})

test.describe('an item in several groups shows in each of them (the workspace)', () => {
  const instances = (page: import('@playwright/test').Page) => page.locator('[data-task^="demo-study"]')
  test('the flat canvas has a card in each of its groups, both lit when it is open, and moving one moves only that group', async ({ page }) => {
    await setUp(page, 'Spatial')
    await page.locator('[data-task]').first().waitFor()
    // Life (given first), Writing and School: three cards, one in each group's box
    await expect(instances(page)).toHaveCount(3)
    const homes = await instances(page).evaluateAll((els) => els.map((e) => (e.closest('[data-box]') as HTMLElement | null)?.dataset.box ?? ''))
    expect(homes.sort()).toEqual(['demo-writing', 'life', 'school'].sort())
    // opening one lights all three
    await page.locator('[data-task="demo-study"] button.truncate').click()
    await page.getByLabel('Task details').waitFor()
    await expect(page.locator('[data-task^="demo-study"].ring-2')).toHaveCount(3)
    // taking the card out of Writing (onto Biology's box) moves only that membership
    const from = (await page.locator('[data-task="demo-study@demo-writing"] button.truncate').boundingBox())!
    const to = (await page.locator('[data-box="bio"]').boundingBox())!
    await page.mouse.move(from.x + 20, from.y + 8)
    await page.mouse.down()
    await page.mouse.move(from.x + 40, from.y + 20, { steps: 3 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 14 })
    await page.mouse.up()
    await expect.poll(async () => ((await saved(page))!.tasks.find((t) => t.title === 'Study group')!.folderIds as string[]).slice().sort()).toEqual(['bio', 'life', 'school'])
  })
})
