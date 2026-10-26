import { describe, expect, it } from 'vitest'
import { addDays, dayLabel, diffDays, monthGrid, startOfWeek } from './dates'
import { fuzzyRank, fuzzyScore, sameName } from './fuzzy'
import { canReparent, descendantIds, pathLabel } from './folders'
import { filterTasks, sortTasks, urgencyForDue, weightOf } from './tasks'
import { seedData } from './seed'

describe('dates', () => {
  it('adds and diffs days across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(diffDays('2026-02-27', '2026-03-02')).toBe(3)
  })
  it('labels the next days', () => {
    expect(dayLabel('2026-10-26', '2026-10-26')).toBe('Today')
    expect(dayLabel('2026-10-27', '2026-10-26')).toBe('Tomorrow')
    expect(dayLabel('2026-10-29', '2026-10-26')).toBe('Thursday')
  })
  it('builds a 42-cell month grid starting on Sunday', () => {
    const g = monthGrid(2026, 9)
    expect(g).toHaveLength(42)
    expect(g[0]).toBe(startOfWeek('2026-10-01'))
  })
})

describe('fuzzy', () => {
  const names = ['English 101', 'Biology', 'Garden', 'Thursday']
  it('matches prefixes, subsequences and typos', () => {
    expect(fuzzyRank('eng', names, (n) => n)[0]).toBe('English 101')
    expect(fuzzyRank('engilsh', names, (n) => n)[0]).toBe('English 101')
    expect(fuzzyRank('bilogy', names, (n) => n)[0]).toBe('Biology')
    expect(fuzzyRank('gdn', names, (n) => n)[0]).toBe('Garden')
  })
  it('does not match unrelated text', () => {
    expect(fuzzyScore('zebra', 'English 101')).toBeLessThan(0.4)
  })
  it('compares names ignoring case and accents', () => {
    expect(sameName('Café', 'cafe')).toBe(true)
  })
})

describe('folders', () => {
  const { folders } = seedData()
  it('collects descendants', () => {
    expect([...descendantIds(folders, 'school')].sort()).toEqual(['bio', 'eng101', 'school'])
  })
  it('prevents cycles', () => {
    expect(canReparent(folders, 'school', 'eng101')).toBe(false)
    expect(canReparent(folders, 'eng101', 'home')).toBe(true)
  })
  it('renders paths', () => {
    expect(pathLabel(folders, 'eng101')).toBe('School / English 101')
  })
})

describe('tasks', () => {
  const { folders, tasks } = seedData()
  it('shows a parent folder\'s descendants', () => {
    const got = filterTasks(tasks, { type: 'folder', id: 'school' }, folders, true)
    expect(got.length).toBe(3)
  })
  it('hides done by default', () => {
    expect(filterTasks(tasks, { type: 'all' }, folders, false).some((t) => t.status === 'done')).toBe(false)
  })
  it('only ever raises urgency from due dates', () => {
    expect(urgencyForDue(0.1, '2026-10-27', '2026-10-26')).toBeGreaterThan(0.7)
    expect(urgencyForDue(0.95, '2026-12-27', '2026-10-26')).toBe(0.95)
  })
  it('sorts by flow, heaviest first', () => {
    const sorted = sortTasks(tasks, 'flow', false)
    expect(weightOf(sorted[0])).toBeGreaterThanOrEqual(weightOf(sorted[1]))
  })
})
