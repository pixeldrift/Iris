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
  it('a repeating task is done when its current occurrence is logged, never for good', () => {
    const t: Task = { ...base(), repeat: { freq: 'daily', interval: 1, from: '2026-10-01' }, status: 'todo', log: [] }
    expect(isDoneNow(t, '2026-10-26')).toBe(false)
    expect(isDoneNow({ ...t, log: ['2026-10-26'] }, '2026-10-26')).toBe(true)
    expect(isDoneNow({ ...t, log: ['2026-10-25'] }, '2026-10-26')).toBe(false)
  })
})
