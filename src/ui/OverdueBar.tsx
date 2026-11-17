import { useMemo } from 'react'
import { isPastEvent } from '../core/schedule'
import { isLate } from '../core/tasks'
import { useStore } from '../state/store'
import { askConfirm } from './dialogs'

/** On the Overdue filter: what is late, and one tap to check off the events that are over (they are rarely something still to do). */
export function OverdueBar() {
  const scope = useStore((s) => s.scope)
  const tasks = useStore((s) => s.tasks)
  const setStatus = useStore((s) => s.setStatus)
  const showToast = useStore((s) => s.showToast)
  const late = useMemo(() => (scope.type === 'overdue' ? tasks.filter(isLate) : []), [scope.type, tasks])
  if (scope.type !== 'overdue') return null
  const events = late.filter((t) => t.kind === 'event' && isPastEvent(t))
  const rest = late.length - events.length
  const checkOff = async () => {
    if (!(await askConfirm({ title: `Check off ${events.length} past ${events.length === 1 ? 'event' : 'events'}?`, message: 'They move to Completed, where you can bring any of them back.', confirmLabel: 'Check off', cancelLabel: 'Keep' }))) return
    for (const t of events) setStatus(t.id, 'done', true)
    showToast(`Checked off ${events.length} past ${events.length === 1 ? 'event' : 'events'}`)
  }
  return (
    <div className="mx-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white/55 px-3 py-1.5 text-xs text-ink-soft md:mx-4" role="status">
      <span>
        {late.length === 0 ? 'Nothing is overdue.' : `${rest} overdue ${rest === 1 ? 'task' : 'tasks'} · ${events.length} past ${events.length === 1 ? 'event' : 'events'}`}
        <span className="text-ink-faint"> · nothing is finished for you</span>
      </span>
      {events.length > 0 && (
        <button type="button" onClick={() => void checkOff()} className="ml-auto rounded-full bg-lilac-100 px-3 py-1 font-medium text-lilac-700 transition hover:bg-lilac-200">
          Check off past events
        </button>
      )}
    </div>
  )
}
