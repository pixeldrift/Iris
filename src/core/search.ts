import { fromISO, MONTHS, ordinalSuffix, relativeLabel, today, WEEKDAYS } from './dates'
import { pathOf } from './folders'
import { describeRecurrence, repeatOf } from './recurrence'
import { formatTime, isOverdue, plannedDate } from './tasks'
import type { Folder, Person, Task } from './types'

const KIND_WORDS: Record<string, string> = { task: 'task', event: 'event appointment', habit: 'habit routine', list: 'list', idea: 'idea thought' }
const STATUS_WORDS: Record<string, string> = { todo: 'seed todo', doing: 'growing doing in progress', done: 'bloomed done finished complete' }

/** Words that describe a date the way someone might type it: "friday", "oct", "28", "28th", "tomorrow". */
function dateWords(d: string | null, now: string): string[] {
  if (!d) return []
  const date = fromISO(d)
  const n = date.getDate()
  return [d, WEEKDAYS[date.getDay()], MONTHS[date.getMonth()], `${n}`, `${n}${ordinalSuffix(n)}`, relativeLabel(d, now)]
}

/** Everything searchable about a task, as one lowercase string. */
export function searchText(t: Task, ctx: { folders: Folder[]; people: Person[] }, now = today()): string {
  const parts: string[] = [t.title, t.notes, t.place, KIND_WORDS[t.kind] ?? t.kind, STATUS_WORDS[t.status] ?? t.status]
  for (const i of t.items) parts.push(i.text)
  for (const id of t.folderIds) parts.push(pathOf(ctx.folders, id).map((f) => f.name).join(' '))
  for (const id of t.personIds) {
    const p = ctx.people.find((x) => x.id === id)
    if (p) parts.push(p.name)
  }
  parts.push(...dateWords(t.day, now), ...dateWords(t.due, now), ...dateWords(t.start, now))
  const planned = plannedDate(t, now)
  if (planned && planned !== t.day && planned !== t.due) parts.push(...dateWords(planned, now))
  if (t.time) parts.push(formatTime(t.time))
  const r = repeatOf(t)
  if (r) parts.push('repeat repeating', describeRecurrence(r))
  if (t.remindAt !== null) parts.push('reminder remind alarm')
  if (isOverdue(t, now)) parts.push('overdue late')
  return parts.join(' ').toLowerCase()
}

/** Every word you typed must appear somewhere in the task (order and case don't matter). */
export function matchesQuery(t: Task, query: string, ctx: { folders: Folder[]; people: Person[] }, now = today()): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = searchText(t, ctx, now)
  return words.every((w) => text.includes(w))
}
