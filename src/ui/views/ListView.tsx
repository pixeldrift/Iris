import { useMemo, useRef, useState } from 'react'
import { useFlip } from '../flip'
import { ScrollFade } from '../ScrollFade'
import { sortTasks } from '../../core/tasks'
import type { SortKey, Task } from '../../core/types'
import { useStore } from '../../state/store'
import { MenuItem, Popover } from '../Popover'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
import { Dim, DoneButton, DueChip, FolderChips, QuickAdd, WeightDot, useTaskDrag } from '../shared'

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'flow', label: 'Top of mind' },
  { id: 'due', label: 'Due date' },
  { id: 'importance', label: 'Importance' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'created', label: 'Newest' },
  { id: 'title', label: 'A → Z' },
]

function Row({ task }: { task: Task }) {
  const el = useRef<HTMLDivElement>(null)
  const onPointerDown = useTaskDrag(task, el)
  const done = task.status === 'done'
  const leave = useLeaveClass(task)
  return (
    <Dim id={task.id}>
      <div
        ref={el}
        data-lift-id={`task:${task.id}`}
        data-flip={task.id}
        onPointerDown={(e) => onPointerDown(e)}
        className={`glass-soft group rise-in flex cursor-pointer items-center gap-2.5 select-none rounded-2xl px-3 py-2.5 transition [-webkit-touch-callout:none] hover:bg-white/70 ${leave}`}
      >
        <DoneButton task={task} />
        <WeightDot task={task} />
        <span className={`min-w-0 flex-1 truncate ${done ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</span>
        <span data-lift-extra className="hidden items-center gap-1 sm:flex">
          <FolderChips task={task} max={2} />
        </span>
        <span data-lift-extra>
          <DueChip task={task} compact />
        </span>
      </div>
    </Dim>
  )
}

export function ListView() {
  const visible = useVisibleTasks()
  const sortKey = useStore((s) => s.settings.sortKey)
  const sortDesc = useStore((s) => s.settings.sortDesc)
  const set = useStore((s) => s.setSetting)
  const addTask = useStore((s) => s.addTask)

  const rows = useMemo(() => sortTasks(visible, sortKey, sortDesc), [visible, sortKey, sortDesc])
  const [menu, setMenu] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  useFlip(listRef)
  const anchor = useRef<HTMLButtonElement>(null)

  return (
    <div className="glass mx-auto flex h-full max-w-3xl flex-col rounded-[2rem] p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <button ref={anchor} onClick={() => setMenu((o) => !o)} className="glass-soft flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm" aria-haspopup="menu" aria-expanded={menu}>
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
      <div className="-mr-2 mt-3 flex min-h-0 flex-1 flex-col">
      <ScrollFade className="pr-2">
      <div ref={listRef} className="space-y-2 py-1">
        {rows.map((t) => (
          <Row key={t.id} task={t} />
        ))}
        {rows.length === 0 && <p className="py-16 text-center font-display text-lg italic text-ink-faint">Nothing here yet. Still water.</p>}
      </div>
      </ScrollFade>
      </div>
    </div>
  )
}
