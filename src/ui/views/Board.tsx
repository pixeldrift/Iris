import { useMemo } from 'react'
import { sortTasks } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
import { Dim, DoneButton, DueChip, FolderChips, GripHandle, QuickAdd, STATUSES, useTaskDrag } from '../shared'

function Card({ task }: { task: Task }) {
  const onPointerDown = useTaskDrag(task)
  const leave = useLeaveClass(task, true)
  return (
    <Dim id={task.id}>
      <div
        onPointerDown={(e) => onPointerDown(e)}
        className={`rise-in group cursor-pointer rounded-2xl border border-white/80 bg-white/65 p-3 shadow-[0_6px_20px_-10px_rgba(107,68,145,0.3)] transition hover:-translate-y-0.5 hover:bg-white/85 ${leave}`}
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
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto md:grid-cols-3 md:overflow-visible">
      {STATUSES.map((col) => (
        <Column key={col.id} id={col.id} label={col.label} hint={col.hint} tasks={sorted.filter((t) => t.status === col.id)} onAdd={(title) => addTask({ title, status: col.id })} />
      ))}
    </div>
  )
}

function Column({ id, label, hint, tasks, onAdd }: { id: string; label: string; hint: string; tasks: Task[]; onAdd: (t: string) => void }) {
  const { over, active, props } = useDropTarget(`status:${id}`)
  return (
    <section
      {...props}
      className={`glass flex min-h-[16rem] flex-col rounded-[1.8rem] p-3.5 transition md:min-h-0 ${over ? 'ring-2 ring-lilac-400/70 bg-lilac-100/50' : active ? 'ring-1 ring-lilac-300/50' : ''}`}
    >
      <header className="mb-3 flex items-baseline gap-2 px-1">
        <h3 className="font-display text-lg">{label}</h3>
        <span className="text-xs text-ink-faint">{hint}</span>
        <span className="ml-auto text-xs tabular-nums text-ink-soft">{tasks.length}</span>
      </header>
      <QuickAdd placeholder="＋ add" onAdd={onAdd} />
      <div className="scroll-soft -mr-1.5 mt-2.5 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1.5">
        {tasks.map((t) => (
          <Card key={t.id} task={t} />
        ))}
      </div>
    </section>
  )
}
