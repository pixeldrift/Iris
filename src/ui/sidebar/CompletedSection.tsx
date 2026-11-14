import { useMemo } from 'react'
import { today } from '../../core/dates'
import { completedDateMatches } from '../../core/tasks'
import type { Scope } from '../../core/types'
import { useStore } from '../../state/store'
import { askConfirm } from '../dialogs'
import { IconCheck, IconTrash } from '../icons'
import { Tip } from '../Tip'
import { ScopeRow, Section } from './Section'

type Completed = Extract<Scope, { type: 'completed' }>
type Period = NonNullable<Completed['period']>

/** The periods the slider steps through, with the words under it. */
const PERIODS: { id: Period; label: string; short: string }[] = [
  { id: 'all', label: 'Everything', short: 'Everything' },
  { id: 'today', label: 'Today', short: 'Today' },
  { id: 'week', label: 'This week', short: 'Week' },
  { id: 'month', label: 'This month', short: 'Month' },
  { id: 'range', label: 'Date range', short: 'Dates' },
]

const dateBox = 'mt-0.5 w-full min-w-0 rounded-lg border border-white/80 bg-white/60 px-1.5 py-1 text-xs text-ink'

/**
 * The sidebar's "Completed" filter: finished tasks by when they were finished (a slider from everything down to a date range), and a
 * button that deletes the ones this filter shows.
 */
export function CompletedSection() {
  const scope = useStore((s) => s.scope)
  const tasks = useStore((s) => s.tasks)
  const setScope = useStore((s) => s.setScope)
  const clearCompleted = useStore((s) => s.clearCompleted)
  const now = today()
  const monthStart = `${now.slice(0, 7)}-01`
  const filter: Completed = scope.type === 'completed' ? scope : { type: 'completed', period: 'all' }
  const period = filter.period ?? 'all'
  const at = PERIODS.findIndex((p) => p.id === period)
  const count = useMemo(() => tasks.filter((t) => t.status === 'done' && completedDateMatches(t, filter)).length, [tasks, filter])
  const from = filter.from ?? monthStart
  const to = filter.to ?? now

  const choose = (id: Period) => setScope({ type: 'completed', period: id, ...(id === 'range' ? { from, to } : {}) })
  const ask = async () => {
    const ok = await askConfirm({
      title: 'Delete completed tasks?',
      message: `This will permanently delete the ${count} completed ${count === 1 ? 'task' : 'tasks'} currently shown by this filter. This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep them',
      danger: true,
    })
    if (ok) clearCompleted(filter)
  }

  return (
    <Section
      id="completed"
      title="Completed"
      pinned
      action={
        scope.type === 'completed' && count > 0 ? (
          <Tip label="Delete the completed tasks currently shown">
            <button type="button" onClick={ask} aria-label="Delete visible completed tasks" className="rounded-lg p-1 text-ink-faint transition hover:bg-rose-soft/60 hover:text-danger">
              <IconTrash size={15} />
            </button>
          </Tip>
        ) : null
      }
    >
      <div className="px-2 pb-2 pt-1">
        <div className="mb-1 flex items-center justify-between text-[0.7rem] text-ink-soft">
          <span>Completed in</span>
          <span className="text-ink-faint">{PERIODS[at].label}</span>
        </div>
        <input type="range" min={0} max={PERIODS.length - 1} step={1} value={at} onChange={(e) => choose(PERIODS[Number(e.target.value)].id)} className="soft" aria-label="Filter completed tasks by date" />
        <div className="-mt-0.5 flex justify-between text-[0.58rem] text-ink-faint">
          {PERIODS.map((p) => (
            <span key={p.id}>{p.short}</span>
          ))}
        </div>
        {period === 'range' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="min-w-0 text-[0.65rem] text-ink-faint">
              From
              <input type="date" aria-label="Completed from date" max={to} value={from} onChange={(e) => setScope({ type: 'completed', period: 'range', from: e.target.value, to: to < e.target.value ? e.target.value : to })} className={dateBox} />
            </label>
            <label className="min-w-0 text-[0.65rem] text-ink-faint">
              Through
              <input type="date" aria-label="Completed through date" min={from} value={to} onChange={(e) => setScope({ type: 'completed', period: 'range', from, to: e.target.value })} className={dateBox} />
            </label>
          </div>
        )}
      </div>
      <ScopeRow active={scope.type === 'completed'} onClick={() => setScope(filter)} icon={<IconCheck />} label="All completed" count={count} />
    </Section>
  )
}
