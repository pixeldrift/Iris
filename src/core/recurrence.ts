import { addDays, diffDays, fromISO, ordinalSuffix, toISO, WEEKDAYS } from './dates'
import type { Recurrence, Task } from './types'

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
/** The date (1-31) of the nth (1-4) or last (-1) given weekday in a month. */
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): number {
  const count = daysIn(year, month)
  if (nth < 0) {
    const lastDow = new Date(year, month, count).getDay()
    return count - ((lastDow - weekday + 7) % 7)
  }
  const firstDow = new Date(year, month, 1).getDay()
  return 1 + ((weekday - firstDow + 7) % 7) + 7 * (nth - 1)
}

const weekStart = (s: string) => addDays(s, -fromISO(s).getDay())

/** Does the series fall on `date`? `anchor` is where it starts (never before it). */
export function occursOn(r: Recurrence, date: string, anchor: string = r.from): boolean {
  if (date < anchor) return false
  const d = fromISO(date)
  const a = fromISO(anchor)
  const n = Math.max(1, r.interval)
  switch (r.freq) {
    case 'daily':
      return diffDays(anchor, date) % n === 0
    case 'weekly': {
      const days = r.byDay?.length ? r.byDay : [a.getDay()]
      if (!days.includes(d.getDay())) return false
      return (diffDays(weekStart(anchor), weekStart(date)) / 7) % n === 0
    }
    case 'monthly': {
      const months = (d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth()
      if (months % n !== 0) return false
      if (r.nth && r.byDay?.length) return d.getDay() === r.byDay[0] && d.getDate() === nthWeekdayOfMonth(d.getFullYear(), d.getMonth(), r.byDay[0], r.nth)
      return d.getDate() === Math.min(r.monthDay ?? a.getDate(), daysIn(d.getFullYear(), d.getMonth()))
    }
    case 'yearly': {
      if (d.getMonth() !== a.getMonth() || (d.getFullYear() - a.getFullYear()) % n !== 0) return false
      return d.getDate() === Math.min(a.getDate(), daysIn(d.getFullYear(), d.getMonth()))
    }
  }
}

/** First occurrence on or after `from` (null if none within about 8 years). */
export function nextOccurrence(r: Recurrence, from: string, anchor: string = r.from): string | null {
  let d = from < anchor ? anchor : from
  for (let i = 0; i < 3000; i++, d = addDays(d, 1)) if (occursOn(r, d, anchor)) return d
  return null
}

/** Last occurrence on or before `from`. */
export function prevOccurrence(r: Recurrence, from: string, anchor: string = r.from): string | null {
  let d = from
  for (let i = 0; i < 3000 && d >= anchor; i++, d = addDays(d, -1)) if (occursOn(r, d, anchor)) return d
  return null
}

/** The series a task follows: its own, or every day for a habit that has none yet. */
export function repeatOf(t: Pick<Task, 'repeat' | 'kind' | 'createdAt'>): Recurrence | null {
  if (t.repeat) return t.repeat
  return t.kind === 'habit' ? { freq: 'daily', interval: 1, from: toISO(new Date(t.createdAt)) } : null
}

/** A task's own planned day, when set, moves where the series starts. */
export const anchorOf = (t: Pick<Task, 'day' | 'repeat' | 'kind' | 'createdAt'>): string => t.day ?? repeatOf(t)?.from ?? toISO(new Date(t.createdAt))

/** Does this task show up on `date`? (A repeating task on each occurrence, otherwise on its planned day or deadline.) */
export function taskOnDate(t: Task, date: string): boolean {
  const r = repeatOf(t)
  return r ? occursOn(r, date, anchorOf(t)) : (t.day ?? t.due) === date
}

/**
 * The occurrence "in play": today if it falls today, else the next one coming, so ticking it off
 * early counts for that one. (A series that has ended in the past falls back to its last.)
 */
export function currentOccurrence(t: Task, now: string): string | null {
  const r = repeatOf(t)
  if (!r) return null
  const a = anchorOf(t)
  return nextOccurrence(r, now, a) ?? prevOccurrence(r, now, a)
}

/** Consecutive occurrences done, counting back from today. Today still open doesn't break the run. */
export function repeatStreak(t: Task, now: string): number {
  const r = repeatOf(t)
  if (!r) return 0
  const a = anchorOf(t)
  let d: string | null = occursOn(r, now, a) && !t.log.includes(now) ? addDays(now, -1) : now
  let n = 0
  for (d = prevOccurrence(r, d, a); d && t.log.includes(d); d = prevOccurrence(r, addDays(d, -1), a)) n++
  return n
}

export function describeRecurrence(r: Recurrence): string {
  const n = Math.max(1, r.interval)
  const dom = r.monthDay ?? fromISO(r.from).getDate()
  switch (r.freq) {
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`
    case 'weekly': {
      const days = [...(r.byDay ?? [])].sort()
      const names = days.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ')
      if (days.join() === '1,2,3,4,5' && n === 1) return 'Every weekday'
      if (days.join() === '0,6' && n === 1) return 'Every weekend'
      return `${n === 1 ? 'Every' : `Every ${n} weeks on`}${n === 1 && !days.length ? ' week' : days.length ? ` ${names}` : ''}`
    }
    case 'monthly':
      if (r.nth && r.byDay?.length) return `${n === 1 ? 'Monthly' : `Every ${n} months`} on the ${r.nth < 0 ? 'last' : `${r.nth}${ordinalSuffix(r.nth)}`} ${WEEKDAYS[r.byDay[0]]}`
      return `${n === 1 ? 'Monthly' : `Every ${n} months`} on the ${dom}${ordinalSuffix(dom)}`
    case 'yearly':
      return n === 1 ? 'Every year' : `Every ${n} years`
  }
}
