import type { Page } from '@playwright/test'

/** The saved app state, as the app wrote it to this browser (tasks, folders, people, settings…). */
export const saved = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('lilac-v1')
    return raw ? (JSON.parse(raw).state as { tasks: Record<string, any>[]; folders: Record<string, any>[]; people: Record<string, any>[]; settings: Record<string, any> }) : null
  })

export const taskNamed = async (page: Page, title: string) => (await saved(page))?.tasks.find((t) => t.title === title)

/** Open the app and wait for it to settle. */
export async function open(page: Page) {
  await page.goto('/')
  await page.locator('[data-node]').first().waitFor()
  await page.waitForTimeout(500)
}

/** Switch view from the sidebar (Pond, List, Progress, Priority, Calendar, Timeline). */
export async function goto(page: Page, view: string) {
  await page.locator('button', { hasText: new RegExp(`^${view}`) }).first().click()
  await page.waitForTimeout(600)
}

export const folderRow = (page: Page, name: string) => page.locator('[data-folder-row]').filter({ hasText: name }).first()

/** Folder rows as "depth:name", in order. */
export const tree = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-folder-row]')].map((e) => `${e.dataset.depth}:${e.innerText.split('\n')[0].trim()}`))

/** A mouse drag in steps, so the app's pointer handling sees real motion. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { steps?: number; release?: boolean } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: opts.steps ?? 10 })
  if (opts.release !== false) await page.mouse.up()
}

/** Press and hold on empty water (a quick click can be too fast for the tap handler to see). */
export async function tapWater(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(60)
  await page.mouse.up()
}
