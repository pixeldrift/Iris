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
    expect(got.length).toBe(4)
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

import { detectContactIntent, matchPerson, contactLink, parseVCards } from './people'
import { groupTasks, layoutClusters, relations } from './groups'
import { reorder } from './folders'
import { boundsOf, fitView, stepSim, type SimNode } from './flock'

describe('people', () => {
  it('detects who to call, email or text', () => {
    expect(detectContactIntent('Call Sarah about the lease')).toEqual({ verb: 'call', name: 'Sarah' })
    expect(detectContactIntent('email Dr Patel re: results')).toEqual({ verb: 'email', name: 'Dr Patel' })
    expect(detectContactIntent('Call mom tomorrow')).toEqual({ verb: 'call', name: 'mom' })
    expect(detectContactIntent('Text Sarah Lee')).toEqual({ verb: 'text', name: 'Sarah Lee' })
    expect(detectContactIntent('Buy milk')).toBeNull()
    expect(detectContactIntent('Call about the lease')).toBeNull()
  })
  it('matches known people by first name, with typos', () => {
    const { people } = seedData()
    expect(matchPerson(people, 'grandma')?.id).toBe('p-grandma')
    expect(matchPerson(people, 'Rose')?.id).toBe('p-grandma')
    expect(matchPerson(people, 'Zed')).toBeNull()
  })
  it('builds tel/mailto links', () => {
    expect(contactLink('call', { phone: '+1 (555) 010-2030', email: '' })?.href).toBe('tel:+15550102030')
    expect(contactLink('email', { phone: '1', email: '' })).toBeNull()
  })
  it('reads vCards', () => {
    const v = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada Lovelace\r\nTEL;TYPE=CELL:+44 20 7946 0000\r\nEMAIL:ada@example.com\r\nADR:;;1 Analytical St;London;;N1;UK\r\nEND:VCARD'
    expect(parseVCards(v)).toEqual([{ name: 'Ada Lovelace', phone: '+44 20 7946 0000', email: 'ada@example.com', address: '1 Analytical St, London, N1, UK' }])
  })
})

describe('grouping & flocking', () => {
  const { tasks, folders, people } = seedData()
  it('groups tasks by top-level folder', () => {
    const g = groupTasks(tasks, 'folder', folders, people, '2026-10-26')
    expect(g.find((x) => x.label === 'School')?.taskIds.length).toBe(4)
    expect(g.reduce((n, x) => n + x.taskIds.length, 0)).toBe(tasks.length)
  })
  it('inside a folder, gathers by its subfolders and keeps the breadcrumb trail', () => {
    const g = groupTasks(tasks, 'folder', folders, people, '2026-10-26', 'school')
    const eng = g.find((x) => x.label === 'English 101')!
    expect(eng.path?.map((p) => p.name)).toEqual(['School', 'English 101'])
    expect(eng.taskIds.length).toBe(3)
    expect(g.find((x) => x.label === 'Biology')?.taskIds.length).toBe(1)
  })
  it('lays out clusters so no two touch', () => {
    const radii = [120, 80, 100, 60, 90]
    const c = layoutClusters(radii, 1.6)
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) expect(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y)).toBeGreaterThan(radii[i] + radii[j])
  })
  it('relates tasks that share a folder or person', () => {
    const r = relations(tasks)
    expect(r.related.size).toBeGreaterThan(0)
  })
  it('pulls related nodes together and keeps unrelated ones apart', () => {
    const mk = (id: string, x: number): SimNode => ({ id, x, y: 0, vx: 0, vy: 0, hx: x, hy: 0, r: 30, pinned: false })
    const nodes = [mk('a', 0), mk('b', 400), mk('c', 800)]
    for (let i = 0; i < 400; i++) stepSim(nodes, { home: 0.002, magnet: 0.1, damping: 0.88 }, (x, y) => [x, y].sort().join() === 'a,b')
    expect(nodes[1].x - nodes[0].x).toBeLessThan(380)
    expect(Math.abs(nodes[2].x - 800)).toBeLessThan(5)
  })
  it('keeps overlapping nodes from stacking and reports bumps', () => {
    const mk = (id: string, x: number, vx: number): SimNode => ({ id, x, y: 0, vx, vy: 0, hx: x, hy: 0, r: 30, pinned: false })
    const nodes = [mk('a', 0, 3), mk('b', 50, -3)]
    let bumped = false
    for (let i = 0; i < 60; i++) bumped = stepSim(nodes, { home: 0.002, magnet: 0, damping: 0.88 }, () => false).bumps.length > 0 || bumped
    expect(bumped).toBe(true)
    expect(Math.abs(nodes[1].x - nodes[0].x)).toBeGreaterThan(50)
  })
  it('frames bounds into the viewport', () => {
    const b = boundsOf([{ x: -500, y: 0, r: 50 }, { x: 1500, y: 800, r: 50 }])!
    const v = fitView(b, 1000, 600)
    expect(v.scale).toBeLessThan(1)
    expect(-500 * v.scale + v.tx).toBeGreaterThan(0)
  })
})

describe('folder flowers', () => {
  it('cycles through every shape before repeating', async () => {
    const { SHAPE_CYCLE, shapeFor } = await import('./folders')
    const first = Array.from({ length: 13 }, (_, i) => shapeFor(i))
    expect(new Set(first).size).toBe(13)
    expect(shapeFor(13)).toBe(SHAPE_CYCLE[0])
  })
  it('gives every seed folder a shape', () => {
    for (const f of seedData().folders) expect(f.shape).toBeTruthy()
  })
})

describe('folder ordering', () => {
  it('inserts before a sibling', () => {
    const { folders } = seedData()
    const order = reorder(folders, 'life', null, 'school')
    expect(order.get('life')).toBe(0)
    expect(order.get('school')).toBe(1)
  })
})

import { nextAllowedDay, plannedDate, rolloverDay, matchesScope } from './tasks'

describe('day planning & rollover', () => {
  const base = seedData().tasks[0]
  // 2026-10-26 is a Monday
  const class_ = { ...base, status: 'todo' as const, day: '2026-10-26', due: '2026-11-06', days: [1, 3, 5], rollover: true }
  it('keeps the planned day separate from the deadline', () => {
    expect(plannedDate({ day: '2026-10-27', due: '2026-11-01' })).toBe('2026-10-27')
    expect(plannedDate({ day: null, due: '2026-11-01' })).toBe('2026-11-01')
    expect(matchesScope({ ...class_, day: '2026-10-27' }, { type: 'day', date: '2026-10-27' }, [])).toBe(true)
    expect(matchesScope({ ...class_, day: '2026-10-27' }, { type: 'day', date: '2026-11-06' }, [])).toBe(false)
  })
  it('does not move anything planned for today or later', () => {
    expect(rolloverDay(class_, '2026-10-26')).toBeNull()
    expect(rolloverDay({ ...class_, day: '2026-10-30' }, '2026-10-26')).toBeNull()
  })
  it('carries an unfinished task to today when unrestricted', () => {
    expect(rolloverDay({ ...class_, days: null }, '2026-10-27')).toBe('2026-10-27')
  })
  it('moves a Mon/Wed/Fri task to the next class day, never a skipped one', () => {
    expect(rolloverDay(class_, '2026-10-27')).toBe('2026-10-28') // Tue -> Wed
    expect(rolloverDay(class_, '2026-10-29')).toBe('2026-10-30') // Thu -> Fri
    expect(rolloverDay(class_, '2026-10-31')).toBe('2026-11-02') // Sat -> Mon
  })
  it('leaves it put when the next available day is past the deadline', () => {
    expect(rolloverDay({ ...class_, due: '2026-10-29' }, '2026-10-30')).toBeNull()
    expect(rolloverDay({ ...class_, due: '2026-10-27' }, '2026-10-27')).toBeNull()
  })
  it('respects "stay put" and finished tasks', () => {
    expect(rolloverDay({ ...class_, rollover: false }, '2026-10-28')).toBeNull()
    expect(rolloverDay({ ...class_, status: 'done' }, '2026-10-28')).toBeNull()
  })
  it('finds the next allowed weekday', () => {
    expect(nextAllowedDay('2026-10-27', [1, 3, 5])).toBe('2026-10-28')
    expect(nextAllowedDay('2026-10-27', null)).toBe('2026-10-27')
  })
})
