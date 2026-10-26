import { useMemo, useRef, useState } from 'react'
import { sortTasks } from '../../core/tasks'
import type { SortKey, Task } from '../../core/types'
import { useStore } from '../../state/store'
import { MenuItem, Popover } from '../Popover'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
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
  const leave = useLeaveClass(task)
  return (
    <Dim id={task.id}>
      <div
        onPointerDown={(e) => onPointerDown(e)}
        className={`glass-soft group rise-in flex cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2.5 transition hover:bg-white/70 ${leave}`}
      >
        <DoneButton task={task} />
        <WeightDot task={task} />
        <span className={`min-w-0 flex-1 truncate ${done ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</span>
        <span className="hidden items-center gap-1 sm:flex">
          <FolderChips task={task} max={2} />
        </span>
        <DueChip task={task} />
        <GripHandle onPointerDown={onPointerDown} />
      </div>
    </Dim>
  )
}

export function ListView() {
  const visible = useVisibleTasks()
  const { sortKey, sortDesc } = useStore((s) => s.settings)
  const set = useStore((s) => s.setSetting)
  const addTask = useStore((s) => s.addTask)

  const rows = useMemo(() => sortTasks(visible, sortKey, sortDesc), [visible, sortKey, sortDesc])
  const [menu, setMenu] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)

  return (
    <div className="glass mx-auto flex h-full max-w-3xl flex-col rounded-[2rem] p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <button ref={anchor} onClick={() => setMenu((o) => !o)} className="glass-soft flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm" aria-haspopup="menu" aria-expanded={menu}>
          {SORTS.find((x) => x.id === sortKey)?.label}
          <span className="text-ink-faint">▾</span>
        </button>
        <Popover open={menu} onClose={() => setMenu(false)} anchor={anchor}>
          {SORTS.map((x) => (
            <MenuItem
              key={x.id}
              active={x.id === sortKey}
              onClick={() => {
                set('sortKey', x.id)
                setMenu(false)
              }}
            >
              {x.label}
            </MenuItem>
          ))}
        </Popover>
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
