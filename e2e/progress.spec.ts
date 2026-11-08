import { expect, test } from '@playwright/test'
import { folderRow, goto, open, saved, taskNamed } from './helpers'

test.describe('progress: percent complete, a count, and the columns', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    await page.keyboard.press('n')
    await page.keyboard.type('Grade essays')
    await page.keyboard.press('Enter')
  })

  test('a count (12 of 20) sets the percent, and the item moves to the column that reaches', async ({ page }) => {
    const dialog = page.getByLabel('Task details')
    await dialog.getByRole('button', { name: /Count items instead/ }).click()
    // the number boxes open a keypad
    await dialog.getByRole('button', { name: 'Total items' }).click()
    const pad = page.getByRole('group', { name: 'Total items keypad' })
    await pad.getByRole('button', { name: '2', exact: true }).click()
    await pad.getByRole('button', { name: '0', exact: true }).click()
    await pad.getByRole('button', { name: 'Done' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Grade essays'))?.tally?.total).toBe(20)
    await dialog.getByRole('button', { name: 'Items completed' }).click()
    const pad2 = page.getByRole('group', { name: 'Items completed keypad' })
    await pad2.getByRole('button', { name: '1', exact: true }).click()
    await pad2.getByRole('button', { name: '2', exact: true }).click()
    await pad2.getByRole('button', { name: 'Done' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Grade essays'))?.progress).toBe(60)
    expect((await taskNamed(page, 'Grade essays'))?.status).toBe('doing') // (60 is past the In progress break point, 1)
    // the + counter
    await dialog.getByRole('button', { name: 'One more' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Grade essays'))?.tally?.done).toBe(13)
    await expect(dialog.getByText('65%')).toBeVisible()
  })

  test('the slider moves the item between columns, and the Stage buttons move the slider', async ({ page }) => {
    const dialog = page.getByLabel('Task details')
    const slider = dialog.getByRole('slider', { name: 'Progress' })
    await slider.fill('100')
    await expect.poll(async () => (await taskNamed(page, 'Grade essays'))?.status).toBe('done')
    await dialog.getByRole('button', { name: 'Not started' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Grade essays'))?.progress).toBe(0)
    await dialog.getByRole('button', { name: 'In progress' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Grade essays'))?.progress).toBe(1) // (the break point to get out of Not started)
    await slider.fill('0')
    await expect.poll(async () => (await taskNamed(page, 'Grade essays'))?.status).toBe('todo')
  })

  test('a list works its percent out from the entries ticked', async ({ page }) => {
    const dialog = page.getByLabel('Task details')
    await dialog.getByRole('radio', { name: 'List', exact: true }).click()
    for (const w of ['a', 'b']) {
      await dialog.getByLabel('Add item').fill(w)
      await dialog.getByLabel('Add item').press('Enter')
    }
    await dialog.getByRole('checkbox', { name: 'Done: a' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Grade essays'))?.progress).toBe(50)
    await expect(dialog.getByRole('slider', { name: 'Progress' })).toBeDisabled()
  })
})

test.describe('column break points', () => {
  test('are set in the stage editor by position, and reordering the columns does not move them', async ({ page }) => {
    await open(page)
    await goto(page, 'Progress')
    await folderRow(page, 'English 101').click()
    await page.getByRole('button', { name: 'Edit stages' }).click()
    await expect(page.getByText('0%', { exact: true })).toBeVisible()
    await expect(page.getByText('100%', { exact: true })).toBeVisible()
    // the middle column's percent is a number box with a keypad
    await page.getByRole('button', { name: 'Stage 2 starts at percent' }).click()
    const pad = page.getByRole('group', { name: 'Stage 2 starts at percent keypad' })
    await pad.getByRole('button', { name: '3', exact: true }).click()
    await pad.getByRole('button', { name: '0', exact: true }).click()
    await pad.getByRole('button', { name: 'Done' }).click()
    const percents = async () => (await saved(page))!.folders.find((f) => f.name === 'English 101')!.stagePercents
    await expect.poll(percents).toEqual([0, 30, 100])
    await page.getByRole('button', { name: 'Add stage' }).click()
    await expect.poll(percents).toEqual([0, 30, 65, 100])
    // carry "New stage" to the top: the names move, the percents stay in their places
    const grip = (await page.getByRole('button', { name: 'Move New stage', exact: true }).boundingBox())!
    const top = (await page.getByLabel('Stage 1 name').boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + 4, top.y + 2, { steps: 8 })
    await page.mouse.up()
    await expect(page.getByLabel('Stage 1 name')).toHaveValue('New stage')
    expect(await percents()).toEqual([0, 30, 65, 100])
  })

  test('a card moved to a column gets that column’s percent, and one past it moves there', async ({ page }) => {
    await open(page)
    await goto(page, 'List')
    await page.keyboard.press('n')
    await page.keyboard.type('Read chapters')
    await page.keyboard.press('Enter')
    const dialog = page.getByLabel('Task details')
    await dialog.getByRole('slider', { name: 'Progress' }).fill('75')
    await expect.poll(async () => (await taskNamed(page, 'Read chapters'))?.status).toBe('doing')
    await dialog.getByRole('button', { name: 'Not started' }).click()
    await expect.poll(async () => (await taskNamed(page, 'Read chapters'))?.progress).toBe(0)
  })
})
