import { addDays, fromISO, toISO, WEEKDAYS } from './dates'
import { formatClock, formatDate } from './locale'
import { anchorOf, nextOccurrence, repeatOf } from './recurrence'
import type { Task } from './types'

const MIN = 60_000

/** When an event starts, as epoch ms (null without a day and a start time). */
export function eventStart(t: Pick<Task, 'day' | 'time'>): number | null {
  if (!t.day || !t.time) return null
  const [h, m] = t.time.split(':').map(Number)
  const d = fromISO(t.day)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** Reminders that have come due and not yet been shown. Finished tasks stay quiet. */
export function dueReminders(tasks: Task[], now: number): Task[] {
  return tasks.filter((t) => !t.draft && t.remindAt !== null && !t.reminded && t.remindAt <= now && t.status !== 'done')
}

export interface ReminderPreset {
  id: string
  label: string
  at: number
  /** A reminder relative to the item's date: days before it. */
  before?: number
}

const atHour = (day: string, hour: number) => {
  const d = fromISO(day)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

/** The date a reminder can be "before": the day you plan to do it, else its deadline. */
export const remindAnchor = (t: Pick<Task, 'day' | 'due'>): string | null => t.day ?? t.due

/**
 * "A day before" without having to say when: the same time of day if the item has one, otherwise a sensible
 * morning (9 am). Null when there is no date to be before, or that moment has already gone.
 */
export function remindFromRule(t: Pick<Task, 'day' | 'due' | 'time'>, daysBefore: number, now = Date.now()): number | null {
  const a = remindAnchor(t)
  if (!a) return null
  const [h, m] = (t.time ?? '09:00').split(':').map(Number)
  const d = fromISO(addDays(a, -daysBefore))
  d.setHours(h, m, 0, 0)
  return d.getTime() > now ? d.getTime() : null
}

/** One-tap choices that are still in the future. Events also get "before it starts" options. */
export function reminderPresets(t: Task, now: number): ReminderPreset[] {
  const today = toISO(new Date(now))
  const list: ReminderPreset[] = []
  const start = t.kind === 'event' ? eventStart(t) : null
  if (start) {
    list.push({ id: 'at', label: 'At start', at: start })
    list.push({ id: '10m', label: '10 min before', at: start - 10 * MIN })
    list.push({ id: '1h', label: '1 hour before', at: start - 60 * MIN })
    list.push({ id: '1d', label: 'A day before', at: start - 24 * 60 * MIN })
  }
  // relative to the item's own date: no clock times to think about
  if (!start && remindAnchor(t)) {
    for (const [n, label] of [[0, 'Morning of'], [1, 'Day before'], [7, 'Week before']] as const) {
      const at = remindFromRule(t, n, now)
      if (at) list.push({ id: `before${n}`, label, at, before: n })
    }
  }
  list.push({ id: 'in1h', label: 'In an hour', at: now + 60 * MIN })
  const evening = atHour(today, 18)
  list.push({ id: 'eve', label: 'This evening', at: evening > now ? evening : atHour(addDays(today, 1), 18) })
  list.push({ id: 'morn', label: 'Tomorrow morning', at: atHour(addDays(today, 1), 9) })
  return list.filter((p) => p.at > now)
}

/** "6 pm today", "9 am tomorrow", "Mon 9:30 am", "Mar 3, 9 am". */
export function formatReminder(at: number, now: number): string {
  const d = new Date(at)
  const h = d.getHours()
  const time = formatClock(h, d.getMinutes())
  const day = toISO(d)
  const today = toISO(new Date(now))
  if (day === today) return `${time} today`
  if (day === addDays(today, 1)) return `${time} tomorrow`
  if (day < addDays(today, 7) && day > today) return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${time}`
  return `${formatDate(day, { now: new Date(now) })}, ${time}`
}

/** `datetime-local` value (local time, `YYYY-MM-DDTHH:MM`) <-> epoch ms. */
export const toLocalInput = (ms: number): string => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (s: string): number | null => {
  const ms = new Date(s).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** "At the time", "10 minutes before", "1 hour before", "2 days before". */
export function alertLabel(minutes: number): string {
  if (minutes <= 0) return 'At the time'
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} before`
  if (minutes % 10080 === 0) return unit(minutes / 10080, 'week')
  if (minutes % 1440 === 0) return unit(minutes / 1440, 'day')
  if (minutes % 60 === 0) return unit(minutes / 60, 'hour')
  return unit(minutes, 'minute')
}

/** The reminders offered for an event, in the order they read best. */
export const ALERT_CHOICES = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]

/** The next choice not already used: what the + button adds. */
export const nextAlertChoice = (have: number[]): number => [60, 1440, 10, 0, 30, 120, 5, 15, 2880, 10080].find((m) => !have.includes(m)) ?? 60

export interface DueAlert {
  task: Task
  /** Identifies this reminder for this occurrence, so it fires once. */
  key: string
  minutes: number
  start: number
}

/**
 * Event reminders that have come due. An alert fires from its time until an hour after the event starts (a
 * device that was closed still tells you shortly after it opens, unless the event is long gone).
 */
export function dueAlerts(tasks: Task[], now: number, startsFor: (t: Task) => number[]): DueAlert[] {
  const out: DueAlert[] = []
  for (const t of tasks) {
    if (t.draft || t.kind !== 'event' || !t.alerts?.length || t.status === 'done') continue
    for (const start of startsFor(t)) {
      for (const minutes of t.alerts) {
        const at = start - minutes * 60_000
        const key = `${start}:${minutes}`
        if (at <= now && now <= start + 3_600_000 && !t.alertsDone?.includes(key)) out.push({ task: t, key, minutes, start })
      }
    }
  }
  return out
}

/** Start times (ms) worth checking reminders for: the event itself, or its coming occurrences when it repeats. */
export function eventStartsFor(t: Task, now: number): number[] {
  if (!t.time) return []
  const r = repeatOf(t)
  if (!r) {
    const s = eventStart(t)
    return s === null ? [] : [s]
  }
  const out: number[] = []
  let day = addDays(toISO(new Date(now)), -1)
  for (let i = 0; i < 4; i++) {
    const d = nextOccurrence(r, day, anchorOf(t))
    if (!d || d > addDays(toISO(new Date(now)), 10)) break
    const s = eventStart({ day: d, time: t.time })
    if (s !== null) out.push(s)
    day = addDays(d, 1)
  }
  return out
}
