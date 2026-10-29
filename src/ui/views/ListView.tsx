import { useMemo, useRef, useState } from 'react'
import { useFlip } from '../flip'
import { ScrollFade } from '../ScrollFade'
import { sortTasks } from '../../core/tasks'
import type { SortKey, Task } from '../../core/types'
import { useStore } from '../../state/store'
import { MenuItem, Popover } from '../Popover'
import { IconTrash } from '../icons'
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

/**
 * Swipe a row left to delete it (touch). It only takes over when the finger clearly moves sideways, so scrolling
 * stays vertical, and a press-and-hold that has already picked the row up for the sidebar is never mistaken for it.
 */
function useSwipeToDelete(row: React.RefObject<HTMLDivElement | null>, reveal: React.RefObject<HTMLDivElement | null>, onDelete: () => void) {
  return (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const el = row.current
    if (!el) return
    const sx = e.clientX
    const sy = e.clientY
    let swiping = false
    const apply = (dx: number) => {
      el.style.transform = `translateX(${dx}px)`
      if (reveal.current) reveal.current.style.opacity = String(Math.min(1, Math.abs(dx) / 80))
    }
    const end = (commit: boolean, dx: number) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      if (!swiping) return
      el.style.transition = 'transform 0.22s ease-out'
      const far = commit && (dx < -el.offsetWidth * 0.35 || dx < -120)
      if (far) {
        el.style.transform = 'translateX(-110%)'
        onDelete()
      } else {
        apply(0)
        window.setTimeout(() => {
          el.style.transition = ''
          el.style.transform = ''
          if (reveal.current) reveal.current.style.opacity = '0'
        }, 240)
      }
    }
    const move = (ev: PointerEvent) => {
      if (document.body.classList.contains('dragging')) return end(false, 0) // it was picked up to be dragged instead
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (!swiping) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return end(false, 0) // a scroll
        if (dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          swiping = true
          el.style.transition = 'none'
        } else return
      }
      apply(Math.min(0, dx))
    }
    const up = (ev: PointerEvent) => end(true, ev.clientX - sx)
    const cancel = () => end(false, 0)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }
}

function Row({ task }: { task: Task }) {
  const el = useRef<HTMLDivElement>(null)
  const reveal = useRef<HTMLDivElement>(null)
  const onPointerDown = useTaskDrag(task, el)
  const del = useStore((s) => s.deleteTask)
  const swipe = useSwipeToDelete(el, reveal, () => del(task.id))
  const done = task.status === 'done'
  const leave = useLeaveClass(task)
  return (
    <Dim id={task.id}>
      <div className="relative overflow-hidden rounded-2xl">
        <div ref={reveal} aria-hidden className="absolute inset-0 flex items-center justify-end rounded-2xl pr-5 text-white opacity-0" style={{ background: 'rgb(210 110 140 / 0.9)' }}>
          <IconTrash size={18} />
        </div>
        <div
          ref={el}
          data-lift-id={`task:${task.id}`}
          data-flip={task.id}
          onPointerDown={(e) => {
            onPointerDown(e)
            swipe(e)
          }}
          style={{ touchAction: 'pan-y' }}
          className={`glass-soft group rise-in relative flex cursor-pointer items-center gap-2.5 select-none rounded-2xl px-3 py-2.5 transition-colors [-webkit-touch-callout:none] hover:bg-white/70 ${leave}`}
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
          {/* with a mouse: a trash can that appears on hover (swiping is for touch) */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              del(task.id)
            }}
            aria-label="Delete"
            title="Delete"
            className="absolute right-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink-faint opacity-0 shadow-sm transition hover:text-[#b04a6e] md:grid md:group-hover:opacity-100"
          >
            <IconTrash size={14} />
          </button>
        </div>
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
