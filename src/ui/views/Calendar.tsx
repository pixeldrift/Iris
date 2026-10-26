import { useMemo, useState } from 'react'
import { addDays, fromISO, monthGrid, MONTHS, startOfWeek, toISO, today, WEEKDAYS } from '../../core/dates'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { IconChevron, IconPlus } from '../icons'
import { useTaskDrag } from '../shared'
import { useLeaveClass, useVisibleTasks } from '../useVisible'

function Chip({ task }: { task: Task }) {
  const onPointerDown = useTaskDrag(task)
  const folders = useStore((s) => s.folders)
  const hue = folders.find((f) => f.id === task.folderIds[0])?.hue ?? 285
  const leave = useLeaveClass(task)
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation()
        onPointerDown(e, true)
      }}
      className={`pop-in cursor-pointer touch-none truncate rounded-lg px-1.5 py-0.5 text-[0.72rem] leading-snug transition hover:brightness-95 ${task.status === 'done' ? 'line-through opacity-60' : ''} ${leave}`}
      style={{ background: `hsla(${hue},70%,87%,.9)`, color: `hsl(${hue},35%,28%)` }}
      title={task.title}
    >
      {task.title}
    </div>
  )
}

function Cell({ date, tasks, month, tall }: { date: string; tasks: Task[]; month: number | null; tall: boolean }) {
  const { over, active, props } = useDropTarget(`day:${date}`)
  const addTask = useStore((s) => s.addTask)
  const select = useStore((s) => s.select)
  const setScope = useStore((s) => s.setScope)
  const isToday = date === today()
  const d = fromISO(date)
  const dim = month !== null && d.getMonth() !== month
  const max = tall ? 12 : 3
  return (
    <div
      {...props}
      className={`group relative flex min-h-0 flex-col gap-1 overflow-hidden rounded-2xl border p-1.5 transition ${
        over ? 'border-lilac-400 bg-lilac-200/70' : isToday ? 'border-lilac-300 bg-white/70' : 'border-white/60 bg-white/35'
      } ${dim ? 'opacity-50' : ''} ${active && !over ? 'border-dashed border-lilac-300' : ''}`}
    >
      <div className="flex items-center">
        <button
          onClick={() => setScope({ type: 'day', date })}
          className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums ${isToday ? 'bg-lilac-500 text-white' : 'text-ink-soft hover:bg-white/70'}`}
        >
          {d.getDate()}
        </button>
        <button
          onClick={() => select(addTask({ title: 'New task', due: date }))}
          className="ml-auto rounded-full p-0.5 text-ink-faint opacity-0 transition hover:bg-white/70 hover:text-lilac-600 group-hover:opacity-100"
          aria-label={`Add task on ${date}`}
        >
          <IconPlus size={14} />
        </button>
      </div>
      <div className="scroll-soft flex min-h-0 flex-col gap-1 overflow-y-auto">
        {tasks.slice(0, max).map((t) => (
          <Chip key={t.id} task={t} />
        ))}
        {tasks.length > max && <span className="px-1 text-[0.68rem] text-ink-faint">+{tasks.length - max} more</span>}
      </div>
    </div>
  )
}

export function CalendarView() {
  const visible = useVisibleTasks()
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [anchor, setAnchor] = useState(today())

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of visible) if (t.due) m.set(t.due, [...(m.get(t.due) ?? []), t])
    return m
  }, [visible])
  const unscheduled = visible.filter((t) => !t.due && t.status !== 'done')

  const a = fromISO(anchor)
  const cells = mode === 'month' ? monthGrid(a.getFullYear(), a.getMonth()) : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
  const step = (dir: number) =>
    setAnchor(mode === 'month' ? toISO(new Date(a.getFullYear(), a.getMonth() + dir, 1)) : addDays(anchor, dir * 7))
  const title = mode === 'month' ? `${MONTHS[a.getMonth()]} ${a.getFullYear()}` : `Week of ${MONTHS[fromISO(cells[0]).getMonth()].slice(0, 3)} ${fromISO(cells[0]).getDate()}`

  return (
    <div className="glass flex h-full flex-col rounded-[2rem] p-3 md:p-4">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 className="font-display text-xl">{title}</h3>
        <div className="ml-2 flex items-center">
          <button onClick={() => step(-1)} className="rounded-full p-1.5 hover:bg-white/60" aria-label="Previous">
            <span className="inline-block rotate-180">
              <IconChevron />
            </span>
          </button>
          <button onClick={() => setAnchor(today())} className="rounded-full px-2.5 py-1 text-xs text-ink-soft hover:bg-white/60">
            Today
          </button>
          <button onClick={() => step(1)} className="rounded-full p-1.5 hover:bg-white/60" aria-label="Next">
            <IconChevron />
          </button>
        </div>
        <div className="glass-soft ml-auto flex rounded-full p-0.5 text-xs">
          {(['month', 'week'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 capitalize transition ${mode === m ? 'bg-lilac-500 text-white shadow' : 'text-ink-soft'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1.5 px-0.5 text-center text-[0.68rem] uppercase tracking-wider text-ink-faint">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w.slice(0, 3)}</span>
        ))}
      </div>
      <div className={`grid min-h-0 flex-1 grid-cols-7 gap-1.5 ${mode === 'month' ? 'grid-rows-6' : 'grid-rows-1'}`}>
        {cells.map((d) => (
          <Cell key={d} date={d} tasks={byDate.get(d) ?? []} month={mode === 'month' ? a.getMonth() : null} tall={mode === 'week'} />
        ))}
      </div>

      {unscheduled.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
          <span className="shrink-0 text-xs text-ink-faint">Unscheduled · drag onto a day</span>
          {unscheduled.map((t) => (
            <div key={t.id} className="w-36 shrink-0">
              <Chip task={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
