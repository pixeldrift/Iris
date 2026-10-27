import { addDays, fromISO, toISO, WEEKDAYS } from './dates'
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
  return tasks.filter((t) => t.remindAt !== null && !t.reminded && t.remindAt <= now && t.status !== 'done')
}

export interface ReminderPreset {
  id: string
  label: string
  at: number
}

const atHour = (day: string, hour: number) => {
  const d = fromISO(day)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
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
  const time = `${h % 12 === 0 ? 12 : h % 12}${d.getMinutes() ? ':' + String(d.getMinutes()).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`
  const day = toISO(d)
  const today = toISO(new Date(now))
  if (day === today) return `${time} today`
  if (day === addDays(today, 1)) return `${time} tomorrow`
  if (day < addDays(today, 7) && day > today) return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${time}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
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
