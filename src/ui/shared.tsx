import { useEffect, useRef, useState } from 'react'
import { tint } from '../core/color'
import { relativeLabel, today } from '../core/dates'
import { isOverdue, plannedDate, weightOf } from '../core/tasks'
import type { Task, TaskStatus } from '../core/types'
import { useStore } from '../state/store'
import { useDnd, usePointerDrag } from './dnd'
import { IconCheck } from './icons'

/** `label` names a whole column; `one` names a single item's stage. */
export const STATUSES: { id: TaskStatus; label: string; one: string; hint: string }[] = [
  { id: 'todo', label: 'Seeds', one: 'Seed', hint: 'Waiting to be tended' },
  { id: 'doing', label: 'Growing', one: 'Growing', hint: 'In motion' },
  { id: 'done', label: 'Bloomed', one: 'Bloomed', hint: 'Finished' },
]

export const KINDS = [
  { id: 'task', label: 'Task' },
  { id: 'idea', label: 'Idea' },
  { id: 'list', label: 'List' },
] as const

export function DoneButton({ task, size = 22 }: { task: Task; size?: number }) {
  const toggle = useStore((s) => s.toggleDone)
  const done = task.status === 'done'
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        toggle(task.id)
      }}
      style={{ width: size, height: size }}
      className={`well-circle grid shrink-0 place-items-center rounded-full ${done ? 'is-on text-white' : 'text-transparent hover:text-lilac-400'}`}
      aria-label={done ? 'Mark not done' : 'Mark done'}
      aria-pressed={done}
    >
      <IconCheck size={size * 0.62} />
    </button>
  )
}

export function FolderChips({ task, max = 3 }: { task: Task; max?: number }) {
  const folders = useStore((s) => s.folders)
  const mine = task.folderIds.map((id) => folders.find((f) => f.id === id)).filter(Boolean)
  if (!mine.length) return null
  return (
    <>
      {mine.slice(0, max).map((f) => (
        <span
          key={f!.id}
          className="rounded-full px-2 py-0.5 text-[0.7rem] leading-none"
          style={{ background: `${tint(f!.hue, 70, 88, .85)}`, color: `${tint(f!.hue, 35, 32)}` }}
        >
          {f!.name}
        </span>
      ))}
      {mine.length > max && <span className="text-[0.7rem] text-ink-faint">+{mine.length - max}</span>}
    </>
  )
}

export function DueChip({ task, compact = false }: { task: Task; compact?: boolean }) {
  const when = plannedDate(task)
  if (!when) return null
  const late = isOverdue(task)
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[0.7rem] leading-none ${
        late ? 'bg-rose-soft/80 text-[#9a4566]' : when === today() ? 'bg-lilac-200/80 text-lilac-700' : 'bg-white/60 text-ink-soft'
      }`}
    >
      {relativeLabel(when)}
      {!compact && task.day && task.due && task.due !== task.day && <i className="ml-1 font-normal opacity-70">· due {relativeLabel(task.due)}</i>}
    </span>
  )
}

/** A soft dot whose size hints at weight, with no number attached. */
export function WeightDot({ task }: { task: Task }) {
  const w = weightOf(task)
  const s = 6 + w * 10
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center" title="">
      <span
        className="rounded-full bg-gradient-to-br from-lilac-200 to-lilac-500"
        style={{ width: s, height: s, opacity: 0.55 + w * 0.45 }}
      />
    </span>
  )
}

/** Draggable task card/row used by list, board and calendar. */
export function useTaskDrag(task: Task, el: React.RefObject<HTMLElement | null>) {
  const select = useStore((s) => s.select)
  return usePointerDrag({
    payload: { type: 'task', id: task.id },
    label: task.title,
    lift: () => el.current,
    touchNeedsHandle: true,
    onClick: () => select(task.id),
    onEnd: ({ target }) => {
      if (target) useStore.getState().dropTask(task.id, target)
    },
  })
}

export function GripHandle({ onPointerDown, label }: { onPointerDown: (e: React.PointerEvent, handle: boolean) => void; label?: string }) {
  return (
    <span
      onPointerDown={(e) => {
        e.stopPropagation()
        onPointerDown(e, true)
      }}
      className="grid h-8 w-7 shrink-0 cursor-grab touch-none place-items-center text-ink-faint/70 hover:text-lilac-500 md:opacity-0 md:transition md:group-hover:opacity-100"
      title={label}
      aria-hidden
    >
      <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
        {[2, 7, 12].map((y) => (
          <g key={y}>
            <circle cx="1.5" cy={y} r="1.1" />
            <circle cx="6.5" cy={y} r="1.1" />
          </g>
        ))}
      </svg>
    </span>
  )
}

export function Dim({ id, children }: { id: string; children: React.ReactNode }) {
  const dragging = useDnd((s) => s.drag?.payload.id === id)
  return <div className={dragging ? 'opacity-40' : ''}>{children}</div>
}

/** Inline “add a task…” input used by list and board columns. */
export function QuickAdd({
  placeholder = 'Add a task…',
  onAdd,
  autoFocus,
}: {
  placeholder?: string
  onAdd: (title: string) => void
  autoFocus?: boolean
}) {
  const [v, setV] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.trim()) return
        onAdd(v.trim())
        setV('')
      }}
    >
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="well w-full rounded-2xl px-4 py-2.5 text-sm"
      />
    </form>
  )
}
