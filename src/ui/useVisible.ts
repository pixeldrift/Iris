import { useMemo } from 'react'
import { matchesScope } from '../core/tasks'
import type { Task } from '../core/types'
import { useStore } from '../state/store'

/**
 * Tasks in the current scope. Just-finished tasks stay for a moment (so they can
 * bloom) and deleted ones stay until their pop animation ends.
 */
export function useVisibleTasks(includeDone = false): Task[] {
  const tasks = useStore((s) => s.tasks)
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  const showDone = useStore((s) => s.settings.showDone)
  const lingering = useStore((s) => s.lingering)
  return useMemo(
    () => tasks.filter((t) => (includeDone || showDone || t.status !== 'done' || lingering[t.id]) && matchesScope(t, scope, folders)),
    [tasks, folders, scope, showDone, lingering, includeDone],
  )
}

/** CSS class for a task's exit animation (pop on delete, bloom-away on done). */
export function useLeaveClass(task: Task, keepDone = false): string {
  const removing = useStore((s) => s.removing[task.id])
  const fading = useStore((s) => !keepDone && !s.settings.showDone && task.status === 'done' && !!s.lingering[task.id])
  return removing ? 'burst pointer-events-none' : fading ? 'bloom-out pointer-events-none' : ''
}
