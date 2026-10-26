import { addDays, diffDays, today } from './dates'
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

export function matchesScope(task: Task, scope: Scope, folders: Folder[]): boolean {
  switch (scope.type) {
    case 'all':
      return true
    case 'inbox':
      return task.folderIds.length === 0 && !task.due
    case 'day':
      return task.due === scope.date
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

const byDue = (a: Task, b: Task) => (a.due ?? '9999').localeCompare(b.due ?? '9999')

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
  return !!t.due && t.status !== 'done' && t.due < now
}

/** Effective start/end for the timeline; falls back to a gentle 1-day span. */
export function spanOf(t: Task): { start: string; end: string } | null {
  if (!t.due && !t.start) return null
  const end = t.due ?? addDays(t.start!, 1)
  let start = t.start ?? end
  if (start > end) start = end
  return { start, end }
}
