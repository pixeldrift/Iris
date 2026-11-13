import { describe, expect, it } from 'vitest'
import { isDoneNow } from './recurrence'
import { seedData } from './seed'
import type { Task } from './types'

const base = (): Task => ({ ...seedData().tasks[0], status: 'todo', log: [], repeat: null, kind: 'task', due: null, day: null, time: null, endTime: null })

describe('isDoneNow: one answer for every view', () => {
  it('a plain task is done when checked off', () => {
    expect(isDoneNow({ ...base(), status: 'todo' }, '2026-10-26')).toBe(false)
    expect(isDoneNow({ ...base(), status: 'done' }, '2026-10-26')).toBe(true)
  })
  it('a past event is not implicitly checked off; the date policy persists completion in task status', () => {
    const event = { ...base(), kind: 'event' as const, day: '2026-10-20', time: '09:00', endTime: '10:00' }
    expect(isDoneNow(event, '2026-10-26')).toBe(false)
    expect(isDoneNow({ ...event, status: 'done' }, '2026-10-26')).toBe(true)
  })
  it('a repeating task is done when its current occurrence is logged, never for good', () => {
    const t: Task = { ...base(), repeat: { freq: 'daily', interval: 1, from: '2026-10-01' }, status: 'todo', log: [] }
    expect(isDoneNow(t, '2026-10-26')).toBe(false)
    expect(isDoneNow({ ...t, log: ['2026-10-26'] }, '2026-10-26')).toBe(true)
    expect(isDoneNow({ ...t, log: ['2026-10-25'] }, '2026-10-26')).toBe(false)
  })
})

import { descendantsOf } from './tree'
import { matchesScope, scopeMatcher } from './tasks'

describe('shared helpers', () => {
  it('descendantsOf walks any depth and leaves the start out', () => {
    const items = [
      { id: 'a', parent: null },
      { id: 'b', parent: 'a' },
      { id: 'c', parent: 'b' },
      { id: 'd', parent: null },
    ]
    expect([...descendantsOf(items, 'a')].sort()).toEqual(['b', 'c'])
    expect(descendantsOf(items, 'd').size).toBe(0)
  })
  it('scopeMatcher gives the same answers as matchesScope', () => {
    const { tasks, folders } = seedData()
    const school = folders.find((f) => f.name === 'School')!
    for (const scope of [{ type: 'all' }, { type: 'inbox' }, { type: 'folder', id: school.id }, { type: 'multi', parts: [{ type: 'folder', id: school.id }] }] as never[]) {
      const m = scopeMatcher(scope, folders)
      for (const t of tasks) expect(m(t)).toBe(matchesScope(t, scope, folders))
    }
  })
})
