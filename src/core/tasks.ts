import { addDays, diffDays, fromISO, today } from './dates'
import { currentOccurrence, repeatOf, repeatStreak, taskOnDate } from './recurrence'
import { descendantIds } from './folders'
import type { Folder, Scope, SortKey, Task } from './types'

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** One soft number for "how much this wants your attention". */
export function weightOf(t: Pick<Task, 'importance' | 'urgency'>): number {
  return clamp01(t.importance * 0.6 + t.urgency * 0.4)
}

/** Dropping a task on a near date makes it a little more pressing, never less. */
export function urgencyForDue(current: number, due: string | null, now = today()): number {
  if (!due) return current
  const d = diffDays(now, due)
  if (d <= 0) return Math.max(current, 0.9)
  if (d <= 2) return Math.max(current, 0.75)
  if (d <= 7) return Math.max(current, 0.5)
  return current
}

/** The day a task shows up on in the calendar: the day you chose, else its deadline. */
export function plannedDate(t: Task, now = today()): string | null {
  return repeatOf(t) ? currentOccurrence(t, now) : (t.day ?? t.due ?? null)
}

export function matchesScope(task: Task, scope: Scope, folders: Folder[]): boolean {
  switch (scope.type) {
    case 'all':
    case 'contacts':
      return true
    case 'inbox':
      return task.folderIds.length === 0 && !task.due && !task.day
    case 'day':
      return taskOnDate(task, scope.date)
    case 'person':
      return task.personIds.includes(scope.id)
    case 'folder': {
      const ids = descendantIds(folders, scope.id)
      return task.folderIds.some((f) => ids.has(f))
    }
  }
}

export function filterTasks(tasks: Task[], scope: Scope, folders: Folder[], showDone: boolean): Task[] {
  return tasks.filter((t) => (showDone || t.status !== 'done') && matchesScope(t, scope, folders))
}

const byDue = (a: Task, b: Task) => (a.due ?? a.day ?? '9999').localeCompare(b.due ?? b.day ?? '9999')

export function sortTasks(tasks: Task[], key: SortKey, desc: boolean): Task[] {
  const dir = desc ? -1 : 1
  const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
    flow: (a, b) => weightOf(b) - weightOf(a), // heaviest first by default
    due: byDue,
    created: (a, b) => a.createdAt - b.createdAt,
    title: (a, b) => a.title.localeCompare(b.title),
    importance: (a, b) => b.importance - a.importance,
    urgency: (a, b) => b.urgency - a.urgency,
  }
  return [...tasks].sort((a, b) => cmp[key](a, b) * dir || a.createdAt - b.createdAt)
}

/** Radius in px for a pond bubble. `scale` false = every bubble the same size. */
export function bubbleRadius(t: Task, scale: boolean): number {
  if (!scale) return 52
  return Math.round(44 + weightOf(t) * 44)
}

export function isOverdue(t: Task, now = today()): boolean {
  return t.status !== 'done' && ((!!t.due && t.due < now) || (!!t.day && t.day < now))
}

/** First date on or after `from` that falls on one of `days` (0 = Sunday). Any day when unrestricted. */
export function nextAllowedDay(from: string, days: number[] | null | undefined): string {
  if (!days || days.length === 0) return from
  for (let i = 0; i < 14; i++) {
    const d = addDays(from, i)
    if (days.includes(fromISO(d).getDay())) return d
  }
  return from
}

/**
 * Where an unfinished task planned for a past day should move to, or null to
 * leave it alone. It lands on the next day it can be done (today at the
 * earliest), unless that would be after its deadline: then it stays put and
 * shows as overdue.
 */
export function rolloverDay(t: Task, now = today()): string | null {
  if (t.kind === 'event' || repeatOf(t)) return null // an event is at its time; a series just repeats
  if (t.status === 'done' || !t.day || t.rollover === false || t.day >= now) return null
  const next = nextAllowedDay(now, t.days)
  if (t.due && next > t.due) return null
  return next
}

/** Effective start/end for the timeline; falls back to a gentle 1-day span. */
export function spanOf(t: Task): { start: string; end: string } | null {
  if (!t.due && !t.start && !t.day) return null
  const end = t.due ?? t.day ?? addDays(t.start!, 1)
  let start = t.start ?? end
  if (start > end) start = end
  return { start, end }
}

/** `15:30` -> `3:30 pm`, `09:00` -> `9 am`. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`
}

/** Consecutive occurrences done (a habit's streak). */
export const habitStreak = (t: Task, now = today()): number => repeatStreak(t, now)
