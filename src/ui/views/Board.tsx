import { useMemo, useRef, useState } from 'react'
import { sortTasks } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { IconChevronDown } from '../icons'
import { ScrollFade } from '../ScrollFade'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
import { CountBubble, Dim, DoneButton, DueChip, FolderChips, GripHandle, QuickAdd, STATUSES, useTaskDrag } from '../shared'

function Card({ task }: { task: Task }) {
  const el = useRef<HTMLDivElement>(null)
  const onPointerDown = useTaskDrag(task, el)
  const leave = useLeaveClass(task, true)
  return (
    <Dim id={task.id}>
      <div
        ref={el}
        data-lift-id={`task:${task.id}`}
        onPointerDown={(e) => onPointerDown(e)}
        className={`rise-in group cursor-pointer rounded-2xl border border-white/80 bg-white/65 p-3 shadow-[0_6px_20px_-10px_rgb(var(--lr-700)/0.3)] transition hover:-translate-y-0.5 hover:bg-white/85 ${leave}`}
      >
        <div className="flex items-start gap-2">
          <DoneButton task={task} size={20} />
          <p className={`min-w-0 flex-1 text-[0.92rem] leading-snug ${task.status === 'done' ? 'text-ink-faint line-through' : ''}`}>{task.title || 'Untitled'}</p>
          <GripHandle onPointerDown={onPointerDown} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <DueChip task={task} />
          <FolderChips task={task} max={2} />
        </div>
      </div>
    </Dim>
  )
}

export function Board() {
  const visible = useVisibleTasks(true)
  const addTask = useStore((s) => s.addTask)
  const sorted = useMemo(() => sortTasks(visible, 'flow', false), [visible])

  return (
    <div className="grid h-full grid-cols-1 content-start gap-3 md:content-normal overflow-y-auto md:grid-cols-3 md:overflow-visible">
      {STATUSES.map((col) => (
        <Column key={col.id} id={col.id} label={col.label} hint={col.hint} tasks={sorted.filter((t) => t.status === col.id)} onAdd={(title) => addTask({ title, status: col.id })} />
      ))}
    </div>
  )
}

function Column({ id, label, hint, tasks, onAdd }: { id: string; label: string; hint: string; tasks: Task[]; onAdd: (t: string) => void }) {
  const { over, active, props } = useDropTarget(`status:${id}`)
  const [open, setOpen] = useState(true)
  return (
    <section
      {...props}
      className={`glass flex flex-col self-start rounded-[1.8rem] p-3.5 transition ${open ? 'min-h-[16rem] md:min-h-0 md:self-stretch' : ''} ${over ? 'ring-2 ring-lilac-400/70 bg-lilac-100/50' : active ? 'ring-1 ring-lilac-300/50' : ''}`}
    >
      <header
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((o) => !o))}
        className={`flex cursor-pointer select-none items-center gap-2 rounded-xl px-1 py-0.5 ${open ? 'mb-3' : ''}`}
      >
        <span className={`inline-grid place-items-center text-ink-faint transition-transform duration-300 ${open ? '' : '-rotate-90'}`}>
          <IconChevronDown size={16} />
        </span>
        <h3 className="font-display text-lg">{label}</h3>
        <span className="min-w-0 truncate text-xs text-ink-faint">{hint}</span>
        <CountBubble n={tasks.length} className="ml-auto" />
      </header>
      {open && (
        <>
          <QuickAdd placeholder="＋ add" onAdd={onAdd} />
          <div className="-mr-1.5 mt-2.5 flex min-h-0 flex-1 flex-col">
            <ScrollFade className="pr-1.5">
              <div className="space-y-2 py-1">
                {tasks.map((t) => (
                  <Card key={t.id} task={t} />
                ))}
              </div>
            </ScrollFade>
          </div>
        </>
      )}
    </section>
  )
}
