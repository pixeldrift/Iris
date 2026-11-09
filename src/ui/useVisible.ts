import { useEffect, useMemo, useState } from 'react'
import { isFinished } from '../core/schedule'
import { matchesQuery } from '../core/search'
import { scopeMatcher } from '../core/tasks'
import type { Task } from '../core/types'
import { useStore } from '../state/store'

/**
 * Tasks in the current scope. Just-finished tasks stay for a moment (so they can
 * bloom) and deleted ones stay until their pop animation ends.
 */
export function useVisibleTasks(includeDone = false, search: 'filter' | 'keep' = 'filter'): Task[] {
  const tasks = useStore((s) => s.tasks)
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const query = useStore((s) => s.search)
  const scope = useStore((s) => s.scope)
  const showDone = useStore((s) => s.settings.showDone)
  const lingering = useStore((s) => s.lingering)
  // an event that ends goes with the finished ones: look again every minute
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000))
  useEffect(() => {
    const id = window.setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return useMemo(() => {
    const inScope = scopeMatcher(scope, folders) // (worked out once, not for every task)
    const asked = search !== 'keep' && query.trim() !== ''
    return tasks.filter(
      (t) =>
        !t.draft &&
        (includeDone || showDone || !isFinished(t, minute * 60_000) || lingering[t.id]) &&
        inScope(t) &&
        // most views show only what matches; the pond keeps everything and fades the rest
        (!asked || matchesQuery(t, query, { folders, people })),
    )
  }, [tasks, folders, people, scope, showDone, lingering, includeDone, search, query, minute])
}

/** Null when nothing is typed; otherwise whether a task matches (for highlighting and fading). */
export function useSearchMatcher(): ((t: Task) => boolean) | null {
  const query = useStore((s) => s.search)
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  return useMemo(() => (query.trim() ? (t: Task) => matchesQuery(t, query, { folders, people }) : null), [query, folders, people])
}

/** CSS class for a task's exit animation (pop on delete, bloom-away on done). */
export function useLeaveClass(task: Task, keepDone = false): string {
  const removing = useStore((s) => s.removing[task.id])
  const fading = useStore((s) => !keepDone && !s.settings.showDone && task.status === 'done' && !!s.lingering[task.id])
  return removing ? 'burst pointer-events-none' : fading ? 'bloom-out pointer-events-none' : ''
}
