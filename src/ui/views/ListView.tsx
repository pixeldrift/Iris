import { useMemo } from 'react'
import { filterTasks, sortTasks } from '../../core/tasks'
import type { SortKey, Task } from '../../core/types'
import { useStore } from '../../state/store'
import { Dim, DoneButton, DueChip, FolderChips, GripHandle, QuickAdd, WeightDot, useTaskDrag } from '../shared'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'flow', label: 'Flow (what wants me most)' },
  { id: 'due', label: 'Due date' },
  { id: 'importance', label: 'Matters most' },
  { id: 'urgency', label: 'Most pressing' },
  { id: 'created', label: 'Newest planted' },
  { id: 'title', label: 'A → Z' },
]

function Row({ task }: { task: Task }) {
  const onPointerDown = useTaskDrag(task)
  const done = task.status === 'done'
  return (
    <Dim id={task.id}>
      <div
        onPointerDown={(e) => onPointerDown(e)}
        className="glass-soft group rise-in flex cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2.5 transition hover:bg-white/70"
      >
        <GripHandle onPointerDown={onPointerDown} />
        <DoneButton task={task} />
        <WeightDot task={task} />
        <span className={`min-w-0 flex-1 truncate ${done ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</span>
        <span className="hidden items-center gap-1 sm:flex">
          <FolderChips task={task} max={2} />
        </span>
        <DueChip task={task} />
      </div>
    </Dim>
  )
}

export function ListView() {
  const tasks = useStore((s) => s.tasks)
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  const { showDone, sortKey, sortDesc } = useStore((s) => s.settings)
  const set = useStore((s) => s.setSetting)
  const addTask = useStore((s) => s.addTask)

  const rows = useMemo(
    () => sortTasks(filterTasks(tasks, scope, folders, showDone), sortKey, sortDesc),
    [tasks, scope, folders, showDone, sortKey, sortDesc],
  )

  return (
    <div className="glass mx-auto flex h-full max-w-3xl flex-col rounded-[2rem] p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <select
          value={sortKey}
          onChange={(e) => set('sortKey', e.target.value as SortKey)}
          className="glass-soft rounded-full px-3.5 py-1.5 text-sm outline-none"
          aria-label="Sort by"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => set('sortDesc', !sortDesc)}
          className="glass-soft rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-white/70"
          aria-label="Reverse order"
        >
          {sortDesc ? '↑ reversed' : '↓'}
        </button>
        <span className="ml-auto text-xs text-ink-faint">{rows.length} floating</span>
      </div>
      <QuickAdd onAdd={(title) => addTask({ title })} />
      <div className="scroll-soft -mr-2 mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
        {rows.map((t) => (
          <Row key={t.id} task={t} />
        ))}
        {rows.length === 0 && <p className="py-16 text-center font-display text-lg italic text-ink-faint">Nothing here yet. Still water.</p>}
      </div>
    </div>
  )
}
