import { describe, expect, it } from 'vitest'
import { completionsByDay, completionsByMonth, groupTotals, streakStats, summarize, windowFor } from './reports'
import { seedData } from './seed'
import type { Task } from './types'

const base = seedData().tasks[0]
const habit = (log: string[], from = '2026-10-01'): Task => ({ ...base, id: 'h', kind: 'habit', repeat: { freq: 'daily', interval: 1, from }, log, status: 'todo', folderIds: [] })
const done = (id: string, at: string, folder?: string): Task => ({ ...base, id, kind: 'task', repeat: null, status: 'done', completedAt: new Date(`${at}T12:00:00`).getTime(), folderIds: folder ? [folder] : [] })

describe('reports', () => {
  it('counts completions per day: one-offs on the day they were finished, repeats on each ticked day', () => {
    const tasks = [done('a', '2026-10-02'), done('b', '2026-10-02'), habit(['2026-10-02', '2026-10-03'])]
    const m = completionsByDay(tasks, '2026-10-01', '2026-10-04')
    expect([...m.entries()]).toEqual([['2026-10-01', 0], ['2026-10-02', 3], ['2026-10-03', 1], ['2026-10-04', 0]])
    expect(completionsByMonth(tasks, '2026-09-30', '2026-10-04').get('2026-10')).toBe(4)
  })

  it('works out current and longest streaks, and the last two weeks', () => {
    // done Oct 1-5, missed 6, done 7-9; today is the 10th and still open
    const log = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09']
    const s = streakStats(habit(log), '2026-10-10')
    expect(s.current).toBe(3)
    expect(s.longest).toBe(5)
    expect(s.recent).toHaveLength(14)
    expect(s.recent.at(-1)).toEqual({ date: '2026-10-10', due: true, done: false })
    expect(streakStats(base, '2026-10-10').longest).toBe(0) // not a repeating item
  })

  it('totals by group, most first, with "No group" for the rest', () => {
    const folders = seedData().folders
    const t = groupTotals([done('a', '2026-10-02', 'bio'), done('b', '2026-10-03', 'bio'), done('c', '2026-10-03')], folders, '2026-10-01', '2026-10-31')
    expect(t.map((x) => [x.name, x.count])).toEqual([['Biology', 2], ['No group', 1]])
  })

  it('summarises and picks windows', () => {
    const s = summarize(new Map([['2026-10-01', 0], ['2026-10-02', 3], ['2026-10-03', 1]]))
    expect(s).toEqual({ total: 4, activeDays: 2, best: { date: '2026-10-02', count: 3 }, days: 3 })
    expect(windowFor('week', '2026-10-29')).toMatchObject({ from: '2026-10-25', to: '2026-10-31' }) // Sun..Sat
    expect(windowFor('month', '2026-10-29', -1)).toMatchObject({ from: '2026-09-01', to: '2026-09-30' })
    expect(windowFor('year', '2026-10-29')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' })
  })
})
