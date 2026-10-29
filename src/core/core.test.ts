import { describe, expect, it } from 'vitest'
import { addDays, dayLabel, diffDays, fromISO, MONTHS, monthGrid, ordinalSuffix, startOfWeek, today, WEEKDAYS } from './dates'
import { fuzzyRank, fuzzyScore, sameName } from './fuzzy'
import { canReparent, descendantIds, pathLabel, placeInTree } from './folders'
import { filterTasks, formatTime, habitStreak, sortTasks, urgencyForDue, weightOf } from './tasks'
import { seedData } from './seed'
import { alertLabel, dueAlerts, dueReminders, eventStart, eventStartsFor, formatReminder, reminderPresets } from './reminders'
import { describeRecurrence, nextOccurrence, occursOn } from './recurrence'
import { parseQuickAdd } from './quickadd'
import { matchesQuery } from './search'
import { composeAddress, parseAddress, splitName } from './people'

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
import { boundsOf, fitView, stepSim, WATER_FEEL, type SimNode } from './flock'

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

describe('water feel', () => {
  // pull a node 100px from home and watch it return; report the overshoot and settling time
  const run = (home: number, damping: number) => {
    const n: SimNode = { id: 'a', x: 100, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, r: 30, pinned: false }
    let minX = 0
    let settled = -1
    for (let i = 0; i < 600; i++) {
      stepSim([n], { home, magnet: 0, damping }, () => false)
      minX = Math.min(minX, n.x)
      if (settled < 0 && Math.abs(n.x) < 2 && Math.abs(n.vx) < 0.05) settled = i
    }
    return { overshoot: -minX, settled }
  }
  it('used to rebound; the new water does not', () => {
    const old = run(0.012, 0.88)
    const now = run(WATER_FEEL.homeGrouped, WATER_FEEL.damping)
    expect(old.overshoot).toBeGreaterThan(5) // 0.88 bounced past home by ~9% of the pull
    expect(now.overshoot).toBeLessThan(2) // thick water: it eases in
    expect(now.settled).toBeGreaterThan(0)
    expect(now.settled).toBeLessThan(150) // ...and still arrives in a couple of seconds
  })
  it('free-mode bubbles are overdamped too', () => {
    const free = run(WATER_FEEL.homeFree, WATER_FEEL.dampingFree)
    expect(free.overshoot).toBeLessThan(1)
    expect(free.settled).toBeLessThan(420) // under ~7s even from a 100px shove
  })
})

describe('folder flowers', () => {
  it('cycles through every shape before repeating', async () => {
    const { SHAPE_CYCLE, shapeFor } = await import('./folders')
    const first = Array.from({ length: 12 }, (_, i) => shapeFor(i))
    expect(new Set(first).size).toBe(12)
    expect(shapeFor(12)).toBe(SHAPE_CYCLE[0])
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

describe('repeating items never carry forward', () => {
  const base = seedData().tasks[0]
  const series = [
    { ...base, kind: 'task' as const, repeat: { freq: 'daily' as const, interval: 1, from: '2026-10-01' }, day: '2026-10-01', status: 'todo' as const, rollover: true },
    { ...base, kind: 'habit' as const, repeat: null, day: '2026-10-01', status: 'todo' as const, rollover: true },
    { ...base, kind: 'task' as const, repeat: { freq: 'weekly' as const, interval: 1, from: '2026-10-01', byDay: [1] }, day: null, status: 'todo' as const, rollover: true },
  ]
  it('is never moved to a later day, however many days pass, and never multiplies', () => {
    for (const t of series) for (let i = 0; i < 90; i++) expect(rolloverDay(t, addDays('2026-10-02', i))).toBeNull()
  })
})

describe('day planning & rollover', () => {
  const base = seedData().tasks[0]
  // 2026-10-26 is a Monday
  const class_ = { ...base, status: 'todo' as const, day: '2026-10-26', due: '2026-11-06', days: [1, 3, 5], rollover: true }
  it('keeps the planned day separate from the deadline', () => {
    expect(plannedDate({ ...base, day: '2026-10-27', due: '2026-11-01' })).toBe('2026-10-27')
    expect(plannedDate({ ...base, day: null, due: '2026-11-01' })).toBe('2026-11-01')
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

describe('placing a dragged folder in the tree', () => {
  const mk = (id: string, parentId: string | null, sort: number) => ({ id, name: id, parentId, hue: 0, shape: 'blossom' as const, sort, createdAt: 0 })
  // School > (Eng, Bio), Home > Garden, Life
  const folders = [mk('school', null, 0), mk('eng', 'school', 0), mk('bio', 'school', 1), mk('home', null, 1), mk('garden', 'home', 0), mk('life', null, 2)]
  // dragging Bio: its row is left out; the slot is directly below Eng, in front of Home
  const rows = [
    { id: 'school', depth: 0 },
    { id: 'eng', depth: 1 },
    { id: 'home', depth: 0 },
    { id: 'garden', depth: 1 },
    { id: 'life', depth: 0 },
  ]
  it('keeps the same level when not pulled sideways', () => {
    expect(placeInTree(folders, 'bio', rows, 1, 1)).toMatchObject({ kind: 'slot', parentId: 'school', beforeId: null, depth: 1 })
  })
  it('pulling left climbs out one level, landing after the old parent', () => {
    expect(placeInTree(folders, 'bio', rows, 1, 0)).toMatchObject({ kind: 'slot', parentId: null, beforeId: 'home', depth: 0 })
  })
  it('pushing right nests under the row above', () => {
    expect(placeInTree(folders, 'bio', rows, 1, 2)).toMatchObject({ kind: 'slot', parentId: 'eng', beforeId: null, depth: 2 })
  })
  it('cannot go shallower than the row below, or deeper than one under the row above', () => {
    expect(placeInTree(folders, 'bio', rows, 2, 0).depth).toBe(1) // between home and garden: at least depth 1
    expect(placeInTree(folders, 'bio', rows, 0, 9).depth).toBe(1)
  })
  it('the top slot is always a root', () => {
    expect(placeInTree(folders, 'bio', rows, -1, 3)).toMatchObject({ kind: 'slot', parentId: null, beforeId: 'school', afterId: null })
  })
})

describe('ordinals', () => {
  it('suffixes days of the month', () => {
    const s = (n: number) => `${n}${ordinalSuffix(n)}`
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(s)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '30th', '31st'])
  })
})

describe('events and habits', () => {
  it('formats times', () => {
    expect([formatTime('15:30'), formatTime('09:00'), formatTime('00:05'), formatTime('12:00')]).toEqual(['3:30 pm', '9 am', '12:05 am', '12 pm'])
  })
  const habit = (log: string[], days: number[] | null = null) => ({
    ...seedData().tasks[0],
    kind: 'habit' as const,
    log,
    day: null,
    repeat: days ? { freq: 'weekly' as const, interval: 1, byDay: days, from: '2026-03-01' } : { freq: 'daily' as const, interval: 1, from: '2026-03-01' },
  })
  it('counts the run back from today, and today still open does not break it', () => {
    expect(habitStreak(habit(['2026-03-10', '2026-03-09', '2026-03-08']), '2026-03-10')).toBe(3)
    expect(habitStreak(habit(['2026-03-09', '2026-03-08']), '2026-03-10')).toBe(2)
    expect(habitStreak(habit(['2026-03-08']), '2026-03-10')).toBe(0)
  })
  it('skips days the habit does not run', () => {
    // 2026-03-09 is a Monday; the habit runs Mon/Wed/Fri, so Tue/Thu/weekends are not misses
    expect(habitStreak(habit(['2026-03-06', '2026-03-09'], [1, 3, 5]), '2026-03-10')).toBe(2)
  })
})

describe('reminders', () => {
  const base = seedData().tasks[0]
  const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
  const now = at(2026, 3, 10, 12, 0)
  it('finds only due, unsent, unfinished reminders', () => {
    const t = (o: object) => ({ ...base, ...o })
    const due = dueReminders(
      [t({ id: 'a', remindAt: now - 1 }), t({ id: 'b', remindAt: now + 1 }), t({ id: 'c', remindAt: now - 1, reminded: true }), t({ id: 'd', remindAt: now - 1, status: 'done' }), t({ id: 'e', remindAt: null })],
      now,
    )
    expect(due.map((x) => x.id)).toEqual(['a'])
  })
  it('offers before-start choices for events, only in the future', () => {
    const ev = { ...base, kind: 'event' as const, day: '2026-03-10', time: '12:30' }
    expect(eventStart(ev)).toBe(at(2026, 3, 10, 12, 30))
    const ids = reminderPresets(ev, now).map((p) => p.id)
    expect(ids).toContain('at')
    expect(ids).toContain('10m')
    expect(ids).not.toContain('1h') // 11:30 has passed
    expect(reminderPresets(base, now).map((p) => p.id)).toEqual(['in1h', 'eve', 'morn'])
  })
  it('words times plainly', () => {
    expect(formatReminder(at(2026, 3, 10, 18), now)).toBe('6 pm today')
    expect(formatReminder(at(2026, 3, 11, 9, 30), now)).toBe('9:30 am tomorrow')
  })
})

describe('recurrence', () => {
  const r = (o: object) => ({ freq: 'daily' as const, interval: 1, from: '2026-01-05', ...o })
  it('weekly on chosen days, every other week', () => {
    const rule = r({ freq: 'weekly', interval: 2, byDay: [1, 3] }) // 2026-01-05 is a Monday
    expect(occursOn(rule, '2026-01-05')).toBe(true)
    expect(occursOn(rule, '2026-01-07')).toBe(true)
    expect(occursOn(rule, '2026-01-12')).toBe(false) // the off week
    expect(occursOn(rule, '2026-01-19')).toBe(true)
    expect(occursOn(rule, '2026-01-04')).toBe(false) // before the start
  })
  it('monthly clamps to the last day, yearly handles leap days', () => {
    const m = r({ freq: 'monthly', from: '2026-01-31' })
    expect(occursOn(m, '2026-02-28')).toBe(true)
    expect(occursOn(m, '2026-03-31')).toBe(true)
    expect(occursOn(m, '2026-02-27')).toBe(false)
    const y = r({ freq: 'yearly', from: '2024-02-29' })
    expect(occursOn(y, '2025-02-28')).toBe(true)
    expect(occursOn(y, '2028-02-29')).toBe(true)
  })
  it('finds the next occurrence and describes itself', () => {
    expect(nextOccurrence(r({ freq: 'weekly', byDay: [5] }), '2026-01-06')).toBe('2026-01-09')
    expect(describeRecurrence(r({ freq: 'weekly', byDay: [1, 3, 5] }))).toBe('Every Mon, Wed, Fri')
    expect(describeRecurrence(r({ freq: 'weekly', byDay: [1, 2, 3, 4, 5] }))).toBe('Every weekday')
    expect(describeRecurrence(r({ freq: 'monthly', monthDay: 1 }))).toBe('Monthly on the 1st')
    expect(describeRecurrence(r({ interval: 3 }))).toBe('Every 3 days')
  })
})

describe('nth weekday of the month', () => {
  const r = { freq: 'monthly' as const, interval: 1, byDay: [2], nth: 3, from: '2026-01-01' }
  it('every third Tuesday', () => {
    expect(occursOn(r, '2026-10-20')).toBe(true) // Tue 20 Oct 2026 is the third Tuesday
    expect(occursOn(r, '2026-10-13')).toBe(false)
    expect(occursOn(r, '2026-10-27')).toBe(false)
    expect(occursOn(r, '2026-11-17')).toBe(true)
    expect(describeRecurrence(r)).toBe('Monthly on the 3rd Tuesday')
  })
  it('last Friday', () => {
    const last = { ...r, byDay: [5], nth: -1 }
    expect(occursOn(last, '2026-10-30')).toBe(true)
    expect(occursOn(last, '2026-10-23')).toBe(false)
    expect(describeRecurrence(last)).toBe('Monthly on the last Friday')
  })
  it('is understood when typed', () => {
    const q = parseQuickAdd('Book club every third tuesday 7pm', new Date(2026, 9, 27, 10, 0), { folders: [], people: [] })
    expect(q.repeat).toMatchObject({ freq: 'monthly', byDay: [2], nth: 3 })
    expect(q.title).toBe('Book club')
  })
})

describe('quick add', () => {
  const now = new Date(2026, 9, 27, 10, 0) // Tue 27 Oct 2026, 10:00
  const { folders, people } = seedData()
  const p = (s: string) => parseQuickAdd(s, now, { folders, people })
  it('reads a day and a time into an event', () => {
    const q = p('Call Sarah tomorrow at 3pm')
    expect(q).toMatchObject({ title: 'Call Sarah', kind: 'event', day: '2026-10-28', time: '15:00' })
    expect(p('Dentist friday 2:30pm')).toMatchObject({ title: 'Dentist', day: '2026-10-30', time: '14:30' })
  })
  it('knows deadlines from plans, and next weeks', () => {
    expect(p('Buy milk by friday')).toMatchObject({ title: 'Buy milk', due: '2026-10-30' })
    expect(p('Buy milk by friday').day).toBeUndefined()
    expect(p('Hand in essay next friday').day).toBe('2026-11-06')
    expect(p('Submit essay oct 31')).toMatchObject({ title: 'Submit essay', day: '2026-10-31' })
    expect(p('Party in 3 days').day).toBe('2026-10-30')
  })
  it('time ranges', () => {
    expect(p('Team meeting 3-4:30pm tomorrow')).toMatchObject({ title: 'Team meeting', time: '15:00', endTime: '16:30', day: '2026-10-28' })
  })
  it('repeats', () => {
    expect(p('Stretch every day')).toMatchObject({ title: 'Stretch', kind: 'habit', repeat: { freq: 'daily', interval: 1 } })
    expect(p('Yoga every mon/wed/fri 7am')).toMatchObject({ title: 'Yoga', time: '07:00', repeat: { freq: 'weekly', byDay: [1, 3, 5] } })
    expect(p('Water plants every 2 weeks').repeat).toMatchObject({ freq: 'weekly', interval: 2 })
    expect(p('Pay rent every month on the 1st').repeat).toMatchObject({ freq: 'monthly', monthDay: 1 })
  })
  it('reminders, prefixes and tags', () => {
    const rem = p('Remind me to call mom at 5pm')
    expect(rem.title).toBe('call mom')
    expect(rem.remindAt).toBe(new Date(2026, 9, 27, 17, 0).getTime())
    expect(rem.time).toBeUndefined()
    expect(p('idea: a poem about rain')).toMatchObject({ kind: 'idea', title: 'a poem about rain' })
    const tagged = p('Read chapters #English 101 @Rose next monday')
    expect(tagged.folderIds).toEqual(['eng101'])
    expect(tagged.personIds).toEqual(['p-grandma'])
    expect(tagged.day).toBe('2026-11-02')
    expect(tagged.title).toBe('Read chapters')
  })
  it('leaves plain text alone', () => {
    expect(p('Buy oat milk')).toMatchObject({ title: 'Buy oat milk', chips: [] })
  })
})

describe('search', () => {
  const { tasks, folders, people } = seedData()
  const ctx = { folders, people }
  const now = today() // the sample data is dated relative to today
  const hit = (q: string) => tasks.filter((t) => matchesQuery(t, q, ctx, now)).map((t) => t.title)
  it('finds words in the title, notes, groups, people and list items', () => {
    expect(hit('osmosis')).toEqual(['Lab report: osmosis'])
    expect(hit('biology')).toContain('Lab report: osmosis') // via its group
    expect(hit('rose')).toContain('Call grandma') // via the tagged person
    expect(hit('lemons')).toEqual(['Groceries']) // inside a list
    expect(hit('LAB   report')).toEqual(['Lab report: osmosis']) // any case, any spacing
    expect(hit('zzz')).toEqual([])
  })
  it('understands dates the way people type them', () => {
    const lab = tasks.find((t) => t.title.startsWith('Lab'))!
    const due = fromISO(lab.due!)
    const short = `${MONTHS[due.getMonth()].slice(0, 3)} ${due.getDate()}`
    expect(hit('tomorrow')).toContain('Lab report: osmosis')
    expect(hit(WEEKDAYS[due.getDay()])).toContain('Lab report: osmosis')
    expect(hit(short)).toContain('Lab report: osmosis')
    expect(hit(`${due.getDate()}${ordinalSuffix(due.getDate())}`)).toContain('Lab report: osmosis')
  })
  it('knows kinds and states', () => {
    expect(hit('habit')).toContain('Morning stretch')
    expect(hit('bloomed')).toContain('Water the ferns')
  })
})

describe('names and addresses', () => {
  it('splits a full name into first and last', () => {
    expect(splitName('Sarah Lee')).toEqual({ first: 'Sarah', last: 'Lee' })
    expect(splitName('Dr. Anita Rao Patel')).toEqual({ first: 'Dr. Anita Rao', last: 'Patel' })
    expect(splitName('Madonna')).toEqual({ first: 'Madonna', last: '' })
    expect(splitName('')).toEqual({ first: '', last: '' })
  })
  it('reads a one-line address into parts', () => {
    expect(parseAddress('12 Elm Street, Springfield, IL 62704')).toEqual({ street: '12 Elm Street', city: 'Springfield', state: 'IL', zip: '62704' })
    expect(parseAddress('12 Elm St Springfield IL 62704')).toEqual({ street: '12 Elm St', city: 'Springfield', state: 'IL', zip: '62704' })
    expect(parseAddress('500 Oak Ave Apt 4B, Austin, tx 78701-1234')).toEqual({ street: '500 Oak Ave Apt 4B', city: 'Austin', state: 'TX', zip: '78701' })
    expect(parseAddress('62704')).toEqual({ street: '', city: '', state: '', zip: '62704' })
    expect(parseAddress('Springfield, IL')).toEqual({ street: '', city: 'Springfield', state: 'IL', zip: '' })
    expect(parseAddress('The Old Mill')).toEqual({ street: 'The Old Mill', city: '', state: '', zip: '' })
    expect(parseAddress('')).toEqual({ street: '', city: '', state: '', zip: '' })
  })
  it('puts the parts back together', () => {
    expect(composeAddress({ street: '12 Elm St', city: 'Springfield', state: 'IL', zip: '62704' })).toBe('12 Elm St, Springfield, IL 62704')
    expect(composeAddress({ street: '', city: 'Springfield', state: 'IL', zip: '' })).toBe('Springfield, IL')
  })
})

describe('event reminders: as many as you like', () => {
  const base = seedData().tasks[0]
  const ev = { ...base, kind: 'event' as const, day: '2026-03-10', time: '15:00', alerts: [1440, 60, 0], alertsDone: [] as string[] }
  const at = (d: number, h: number, mi = 0) => new Date(2026, 2, d, h, mi).getTime()
  const fire = (now: number, t = ev) => dueAlerts([t], now, (x) => eventStartsFor(x, now)).map((a) => a.minutes).sort((a, b) => b - a)
  it('labels them plainly', () => {
    expect([0, 5, 60, 120, 1440, 2880, 90].map(alertLabel)).toEqual(['At the time', '5 minutes before', '1 hour before', '2 hours before', '1 day before', '2 days before', '90 minutes before'])
  })
  it('each fires when its time comes, and only once', () => {
    expect(fire(at(9, 14))).toEqual([]) // before the day-before reminder
    expect(fire(at(9, 15, 1))).toEqual([1440])
    expect(fire(at(10, 14, 5))).toEqual([1440, 60]) // two are due together
    const start = at(10, 15)
    expect(fire(at(10, 14, 5), { ...ev, alertsDone: [`${start}:1440`] })).toEqual([60]) // one already went off
    expect(fire(at(10, 15, 1), { ...ev, alertsDone: [`${start}:1440`, `${start}:60`] })).toEqual([0])
  })
  it('goes quiet long after the event, and for finished events', () => {
    expect(fire(at(10, 17))).toEqual([])
    expect(fire(at(10, 14, 5), { ...ev, status: 'done' })).toEqual([])
  })
  it('a repeating event reminds for its coming occurrence', () => {
    const weekly = { ...ev, day: '2026-03-03', alerts: [60], repeat: { freq: 'weekly' as const, interval: 1, byDay: [2], from: '2026-03-03' } }
    expect(fire(at(10, 14, 30), weekly)).toEqual([60]) // Tue 10 Mar 15:00
    expect(eventStartsFor(weekly, at(10, 14, 30)).includes(at(10, 15))).toBe(true)
  })
})

import { dropSampleCopies } from './seed'
describe('sample data identity', () => {
  it('gives the same ids every time, so sync can recognise the samples', () => {
    expect(seedData().tasks.map((t) => t.id)).toEqual(seedData().tasks.map((t) => t.id))
  })
  it('removes stray copies of a sample but keeps the real one, and never a lone sample or a real task', () => {
    const real = seedData().tasks[3] // "Repot the lilac"
    const list = [real, { ...real, id: 'seed-900' }, { ...real, id: 'seed-901' }, { ...real, id: 'mine-1', title: 'Something I wrote' }, { ...real, id: 'abc', title: real.title }]
    expect(dropSampleCopies(list).map((t) => t.id)).toEqual([real.id, 'mine-1', 'abc'])
    // only copies, none with the real id: the oldest stays
    expect(dropSampleCopies([{ ...real, id: 'seed-900' }, { ...real, id: 'seed-50' }]).map((t) => t.id)).toEqual(['seed-50'])
    // a lone sample (even with an unfamiliar id) is left alone
    const lone = [{ ...real, id: 'seed-900' }]
    expect(dropSampleCopies(lone)).toBe(lone)
  })
})
