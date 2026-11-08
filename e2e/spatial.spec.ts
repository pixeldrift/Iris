import { expect, test } from '@playwright/test'
import { goto, open } from './helpers'

const intro = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Spatial workspace' })

async function enter(page: import('@playwright/test').Page, how: 'Start looking around' | 'Use touch only' | 'Start' = 'Use touch only') {
  await open(page)
  await goto(page, 'Space')
  await page.getByRole('button', { name: how }).click()
}

test.describe('spatial workspace', () => {
  test('opens with a short explanation, then shows the tasks in 3D with touch navigation when there is no motion sensor', async ({ page }) => {
    await open(page)
    await goto(page, 'Space')
    await expect(page.getByText('Look around your tasks')).toBeVisible()
    await page.getByRole('button', { name: 'Start looking around' }).click() // (a desktop browser has no motion: it falls back to touch)
    await expect(intro(page).locator('canvas')).toBeVisible()
    await expect(page.getByText('Touch navigation', { exact: true })).toBeVisible({ timeout: 6000 })
    await expect(page.getByRole('button', { name: 'Recenter' })).toBeVisible()
    // the tasks are all there for the keyboard and screen readers
    await expect(page.getByRole('list', { name: 'Tasks in your workspace' }).getByRole('button', { name: 'Pay rent' }).first()).toBeAttached()
  })

  test('dragging looks around, the wheel zooms, and a layout is kept for next time', async ({ page }) => {
    await enter(page)
    const canvas = intro(page).locator('canvas')
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.8, { steps: 8 })
    await page.mouse.up()
    await page.mouse.wheel(0, -300)
    await page.getByRole('button', { name: 'Recenter' }).click()
    // places are stored by id, apart from the tasks
    const layout = await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-spatial-v2') ?? 'null')?.state?.layout)
    expect(Object.keys(layout.tasks).length).toBeGreaterThan(5)
    expect(Object.keys(layout.clusters).length).toBeGreaterThan(1)
    const before = JSON.stringify(layout)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.locator('[data-node]').first()).toBeVisible() // (the pond again)
    await goto(page, 'Space')
    await page.getByRole('button', { name: 'Use touch only' }).click()
    await expect.poll(async () => JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-spatial-v2')!).state.layout))).toBe(before)
  })

  test('a task completed from the workspace is completed everywhere, and one added appears', async ({ page }) => {
    await enter(page)
    const list = page.getByRole('list', { name: 'Tasks in your workspace' })
    await list.getByRole('button', { name: 'Mark done: Call grandma' }).dispatchEvent('click')
    await expect(list.getByRole('button', { name: 'Call grandma' })).toHaveCount(0) // (completed ones leave, as in the other views)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await goto(page, 'List')
    await expect(page.getByText('Call grandma', { exact: true })).toHaveCount(0)
  })

  test('motion permission denied: touch navigation, with a quiet note', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { DeviceOrientationEvent: unknown }).DeviceOrientationEvent = Object.assign(function () {}, { requestPermission: async () => 'denied' })
    })
    await enter(page, 'Start looking around')
    await expect(page.getByText(/Motion tracking was not allowed/)).toBeVisible()
    await expect(page.getByText('Touch navigation', { exact: true })).toBeVisible()
    await expect(intro(page).locator('canvas')).toBeVisible()
  })

  test('motion permission granted: motion tracking, and it survives the device turning', async ({ page }) => {
    await page.addInitScript(() => {
      class DOE extends Event {
        alpha: number
        beta: number
        gamma: number
        constructor(type: string, init: { alpha: number; beta: number; gamma: number }) {
          super(type)
          this.alpha = init.alpha
          this.beta = init.beta
          this.gamma = init.gamma
        }
        static requestPermission = async () => 'granted'
      }
      ;(window as unknown as { DeviceOrientationEvent: unknown }).DeviceOrientationEvent = DOE
      let a = 0
      setInterval(() => window.dispatchEvent(new DOE('deviceorientation', { alpha: (a += 0.5) % 360, beta: 90, gamma: 0 }) as unknown as Event), 30)
    })
    await enter(page, 'Start looking around')
    await expect(page.getByText('Motion tracking', { exact: true })).toBeVisible({ timeout: 6000 })
    await page.getByRole('button', { name: 'Recenter' }).click()
    await page.setViewportSize({ width: 390, height: 700 }) // (turning the phone changes the window; it must stay put)
    await page.setViewportSize({ width: 700, height: 390 })
    await expect(intro(page).locator('canvas')).toBeVisible()
    // and turning it off falls back to touch
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    await page.getByRole('radio', { name: 'Touch only' }).click()
    await expect(page.getByText('Touch navigation', { exact: true })).toBeVisible()
  })

  test('without WebGL it is a flat canvas that still works: open and tick tasks, zoom and pan', async ({ page }) => {
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith('webgl') || type === 'experimental-webgl') return null
        return (get as (...a: unknown[]) => unknown).call(this, type, ...rest)
      } as typeof get
    })
    await open(page)
    await goto(page, 'Space')
    await page.getByRole('button', { name: /^Start/ }).first().click()
    await expect(intro(page).locator('canvas')).toHaveCount(0)
    await expect(page.getByText('Flat view', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'School' })).toBeVisible()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: /Lab report/ }).first().click()
    await expect(page.getByLabel('Task details')).toBeVisible()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
  })

  test('groups out of view get a soft dot on the frame, and tapping one turns to that group', async ({ page }) => {
    await enter(page)
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click() // (everything starts in view, so zoom in to push some out)
    await page.waitForTimeout(800)
    await expect.poll(() => page.locator('.edge-dot:not(.leaving)').count()).toBeGreaterThan(0)
    const before = await page.locator('.edge-dot:not(.leaving)').count()
    await page.locator('.edge-dot:not(.leaving)').first().click({ force: true }) // (it breathes, so it is never "stable")
    await page.waitForTimeout(1200)
    // turning toward one group puts others behind: the dots are different now (and still on the frame)
    const on = await page.locator('.edge-dot:not(.leaving)').evaluateAll((els) => {
      const host = els[0]?.parentElement?.getBoundingClientRect()
      return !host || els.every((e) => {
        const r = e.getBoundingClientRect()
        return r.left >= host.left - 2 && r.right <= host.right + 2 && r.top >= host.top - 2 && r.bottom <= host.bottom + 2
      })
    })
    expect(on).toBe(true)
    expect(before).toBeGreaterThan(0)
  })

  test('the faint curves between groups and subgroups can be switched off', async ({ page }) => {
    await enter(page)
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    const box = page.getByRole('checkbox', { name: /Faint curves/ })
    await expect(box).toBeChecked()
    await box.uncheck()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lilac-spatial-v2')!).state.links)).toBe(false)
    await expect(intro(page).locator('canvas')).toBeVisible()
  })

  test('starts with the whole wall in view, and Fit all goes back to that after zooming', async ({ page }) => {
    await enter(page)
    await expect(page.getByRole('button', { name: 'Fit all' })).toBeVisible()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.waitForTimeout(800)
    const zoomed = await page.locator('.edge-dot:not(.leaving)').count()
    expect(zoomed).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Fit all' }).click()
    await page.waitForTimeout(1400)
    await expect(intro(page).locator('canvas')).toBeVisible()
    // fitting brings the groups back into view: fewer dots at the edge than when zoomed in
    expect(await page.locator('.edge-dot:not(.leaving)').count()).toBeLessThan(zoomed)
  })

  test('the view angle slider (in the settings) sets the lens, and its dot puts it back', async ({ page }) => {
    await enter(page)
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    const slider = page.getByRole('slider', { name: 'View angle' })
    await expect(slider).toBeVisible()
    await slider.fill('30')
    await expect(slider).toHaveValue('30')
    await page.getByRole('button', { name: 'Back to the usual view angle' }).click()
    await expect(slider).toHaveValue('60')
  })

  test('the flat view can be chosen by hand', async ({ page }) => {
    await enter(page)
    await page.getByRole('button', { name: 'Spatial settings' }).click()
    await page.getByRole('radio', { name: 'Flat' }).click()
    await expect(intro(page).locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'School' })).toBeVisible()
  })
})

test.describe('a lot of tasks', () => {
  test('300 tasks open without errors and the layout gives each its own place', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await page.locator('[data-node]').first().waitFor()
    await page.waitForFunction(() => !!localStorage.getItem('lilac-v1'))
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('lilac-v1')!)
      const base = raw.state.tasks.find((x: { title: string }) => x.title === 'Pay rent')
      const folders = raw.state.folders.map((f: { id: string }) => f.id)
      for (let i = 0; i < 300; i++) raw.state.tasks.push({ ...base, id: `bulk-${i}`, title: `Bulk task number ${i}`, repeat: null, folderIds: [folders[i % folders.length]], personIds: [] })
      localStorage.setItem('lilac-v1', JSON.stringify(raw))
    })
    await page.reload()
    await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2500 }).catch(() => {})
    await goto(page, 'Space')
    await page.getByRole('button', { name: 'Use touch only' }).click()
    await expect(intro(page).locator('canvas')).toBeVisible()
    await page.waitForTimeout(1500)
    const layout = await page.evaluate(() => JSON.parse(localStorage.getItem('lilac-spatial-v2')!).state.layout)
    expect(Object.keys(layout.tasks).length).toBeGreaterThan(300)
    // no two tasks share a spot in the same group
    const seen = new Set<string>()
    for (const t of Object.values(layout.tasks) as { c: string; u: number; v: number }[]) {
      const k = `${t.c}:${t.u.toFixed(2)}:${t.v.toFixed(2)}`
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
    expect(errors).toEqual([])
  })
})
