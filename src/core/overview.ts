import { addDays, diffDays, fromISO, toISO } from './dates'
import { anchorOf, nextOccurrence, occursOn, repeatOf, repeatStreak } from './recurrence'
import type { Folder, Task } from './types'

/** Local calendar date of an epoch time. */
const localDate = (ms: number) => toISO(new Date(ms))

/** The dates on which this item was completed: each ticked occurrence of a repeating one, or the day a one-off was finished. */
export function completionDates(t: Task): string[] {
  if (repeatOf(t)) return t.log
  return t.status === 'done' && t.completedAt ? [localDate(t.completedAt)] : []
}

/** How many completions fall on each date in [from, to] (dates with none are present, as 0). */
export function completionsByDay(tasks: Task[], from: string, to: string): Map<string, number> {
  const out = new Map<string, number>()
  for (let d = from; d <= to; d = addDays(d, 1)) out.set(d, 0)
  for (const t of tasks) for (const d of completionDates(t)) if (d >= from && d <= to) out.set(d, (out.get(d) ?? 0) + 1)
  return out
}

/** The same, folded into calendar months (`YYYY-MM`), for a year-long view. */
export function completionsByMonth(tasks: Task[], from: string, to: string): Map<string, number> {
  const out = new Map<string, number>()
  for (let d = from; d <= to; d = addDays(d, 1)) out.set(d.slice(0, 7), 0)
  for (const [d, n] of completionsByDay(tasks, from, to)) out.set(d.slice(0, 7), (out.get(d.slice(0, 7)) ?? 0) + n)
  return out
}

export interface Streaks {
  /** Occurrences done in a row, counting back from today (today still open doesn't break it). */
  current: number
  /** The longest such run ever. */
  longest: number
  /** The last two weeks, oldest first: was it due that day, and was it done. */
  recent: { date: string; due: boolean; done: boolean }[]
}

/** Streak numbers for a repeating item (or habit). */
export function streakStats(t: Task, now: string): Streaks {
  const r = repeatOf(t)
  if (!r) return { current: 0, longest: 0, recent: [] }
  const a = anchorOf(t)
  const done = new Set(t.log)
  // every occurrence from the first date it was either due or done, up to today
  const first = [a, ...t.log].sort()[0]
  let longest = 0
  let run = 0
  let d = nextOccurrence(r, first, a)
  for (let guard = 0; d && d <= now && guard < 3000; guard++) {
    run = done.has(d) ? run + 1 : 0
    longest = Math.max(longest, run)
    d = nextOccurrence(r, addDays(d, 1), a)
  }
  const current = repeatStreak(t, now) // today still open doesn't break it
  longest = Math.max(longest, current)
  const recent = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(now, i - 13)
    return { date, due: occursOn(r, date, a), done: done.has(date) }
  })
  return { current, longest, recent }
}

export interface GroupTotal {
  id: string | null
  name: string
  hue: number | null
  count: number
}

/** Completions in [from, to] by the item's first group (none = "No group"), most first. */
export function groupTotals(tasks: Task[], folders: Folder[], from: string, to: string): GroupTotal[] {
  const by = new Map<string | null, number>()
  for (const t of tasks) {
    const n = completionDates(t).filter((d) => d >= from && d <= to).length
    if (!n) continue
    const id = t.folderIds[0] && folders.some((f) => f.id === t.folderIds[0]) ? t.folderIds[0] : null
    by.set(id, (by.get(id) ?? 0) + n)
  }
  return [...by.entries()]
    .map(([id, count]) => {
      const f = id ? folders.find((x) => x.id === id) : undefined
      return { id, name: f?.name ?? 'No group', hue: f?.hue ?? null, count }
    })
    .sort((a, b) => b.count - a.count)
}

export interface Summary {
  total: number
  activeDays: number
  best: { date: string; count: number } | null
  days: number
}

export function summarize(counts: Map<string, number>): Summary {
  let total = 0
  let activeDays = 0
  let best: Summary['best'] = null
  for (const [date, count] of counts) {
    total += count
    if (count > 0) activeDays++
    if (count > 0 && (!best || count > best.count)) best = { date, count }
  }
  return { total, activeDays, best, days: counts.size }
}

/** The window shown: a week (Sun–Sat), a calendar month, or a calendar year, `offset` windows away from the one holding `now`. */
export function windowFor(range: 'week' | 'month' | 'year', now: string, offset = 0): { from: string; to: string; label: string } {
  const d = fromISO(now)
  if (range === 'week') {
    const start = addDays(now, -d.getDay() + offset * 7)
    return { from: start, to: addDays(start, 6), label: '' }
  }
  if (range === 'month') {
    const first = new Date(d.getFullYear(), d.getMonth() + offset, 1)
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
    return { from: toISO(first), to: toISO(last), label: '' }
  }
  const y = d.getFullYear() + offset
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: '' }
}

export const daysIn = (from: string, to: string) => diffDays(from, to) + 1
