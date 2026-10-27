import { useMemo, useRef, useState } from 'react'
import { tint } from '../../core/color'
import { addDays, fromISO, monthGrid, MONTHS, startOfWeek, toISO, today, WEEKDAYS } from '../../core/dates'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { IconChevron, IconPlus } from '../icons'
import { useTaskDrag } from '../shared'
import { formatTime, plannedDate } from '../../core/tasks'
import { useIsMobile } from '../useMedia'
import { useLeaveClass, useVisibleTasks } from '../useVisible'

function Chip({ task, deadline = false }: { task: Task; deadline?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const onPointerDown = useTaskDrag(task, el)
  const folders = useStore((s) => s.folders)
  const hue = folders.find((f) => f.id === task.folderIds[0])?.hue ?? 285
  const leave = useLeaveClass(task)
  return (
    <div
      ref={el}
      data-lift-id={deadline ? undefined : `task:${task.id}`}
      onPointerDown={(e) => {
        e.stopPropagation()
        onPointerDown(e, true)
      }}
      className={`pop-in cursor-pointer touch-none truncate rounded-lg px-1.5 py-0.5 text-[0.72rem] leading-snug transition hover:brightness-95 ${task.status === 'done' ? 'line-through opacity-60' : ''} ${leave}`}
      style={deadline ? { background: 'transparent', boxShadow: `inset 0 0 0 1px ${tint(hue, 45, 60, .55)}`, color: `${tint(hue, 35, 35)}` } : { background: `${tint(hue, 70, 87, .9)}`, color: `${tint(hue, 35, 28)}` }}
      title={deadline ? `${task.title} (due)` : task.title}
    >
      {deadline ? '⚑ ' : ''}
      {task.kind === 'event' && task.time ? `${formatTime(task.time)} ` : ''}
      {task.title}
    </div>
  )
}

function Cell({ date, tasks, month, tall, named = false, roomy = false }: { date: string; tasks: { task: Task; deadline: boolean }[]; month: number | null; tall: boolean; named?: boolean; roomy?: boolean }) {
  const { over, active, props } = useDropTarget(`day:${date}`)
  const addTask = useStore((s) => s.addTask)
  const select = useStore((s) => s.select)
  const setScope = useStore((s) => s.setScope)
  const isToday = date === today()
  const d = fromISO(date)
  const dim = month !== null && d.getMonth() !== month
  const max = roomy ? 99 : tall ? 12 : 3
  return (
    <div
      {...props}
      className={`group relative flex flex-col gap-1 overflow-hidden rounded-2xl border p-1.5 transition ${named && !roomy ? 'min-h-[4.5rem] shrink-0' : 'min-h-0'} ${
        over ? 'border-lilac-400 bg-lilac-200/70' : isToday ? 'border-lilac-300 bg-white/70' : 'border-white/60 bg-white/35'
      } ${dim ? 'opacity-50' : ''} ${active && !over ? 'border-dotted border-lilac-300' : ''}`}
    >
      <div className="flex items-center">
        <button
          onClick={() => setScope({ type: 'day', date })}
          className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums ${isToday ? 'bg-lilac-500 text-white' : 'text-ink-soft hover:bg-white/70'}`}
        >
          {d.getDate()}
        </button>
        {named && <span className="ml-2 text-sm text-ink-soft">{WEEKDAYS[d.getDay()]}</span>}
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
          <Chip key={t.task.id + (t.deadline ? 'd' : '')} task={t.task} deadline={t.deadline} />
        ))}
        {tasks.length > max && <span className="px-1 text-[0.68rem] text-ink-faint">+{tasks.length - max} more</span>}
      </div>
    </div>
  )
}

type Mode = 'month' | 'week' | 'day'

const readWeekends = () => {
  try {
    return localStorage.getItem('lilac-weekends') !== '0'
  } catch {
    return true
  }
}

/** A calendar control: same height and centring for every one, so rows of them line up. */
const ctl = 'grid h-8 place-items-center rounded-full transition hover:bg-white/60'

export function CalendarView() {
  const visible = useVisibleTasks()
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('month')
  const [anchor, setAnchor] = useState(today())
  const [weekends, setWeekends] = useState(readWeekends)
  const toggleWeekends = () =>
    setWeekends((w) => {
      try {
        localStorage.setItem('lilac-weekends', w ? '0' : '1')
      } catch {
        /* private mode: just for this visit */
      }
      return !w
    })
  const isWeekend = (d: string) => [0, 6].includes(fromISO(d).getDay())
  const show = (d: string) => weekends || !isWeekend(d)

  const byDate = useMemo(() => {
    // a task sits on the day you planned it; if its deadline is a different day, a faint flag marks that too
    const m = new Map<string, { task: Task; deadline: boolean }[]>()
    const put = (d: string, task: Task, deadline: boolean) => m.set(d, [...(m.get(d) ?? []), { task, deadline }])
    for (const t of visible) {
      const when = plannedDate(t)
      if (when) put(when, t, false)
      if (t.day && t.due && t.due !== t.day) put(t.due, t, true)
    }
    return m
  }, [visible])
  const unscheduled = visible.filter((t) => !plannedDate(t) && t.status !== 'done')

  // keep the anchor on a visible day when weekends are hidden
  const dayAnchor = show(anchor) ? anchor : addDays(anchor, fromISO(anchor).getDay() === 6 ? -1 : 1)
  const a = fromISO(anchor)
  const cells =
    mode === 'month'
      ? monthGrid(a.getFullYear(), a.getMonth()).filter(show)
      : mode === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)).filter(show)
        : [dayAnchor]
  const cols = mode === 'day' ? 1 : weekends ? 7 : 5
  const stacked = mode === 'week' && mobile // seven slim columns can't show anything on a phone: stack the days
  const step = (dir: number) => {
    if (mode === 'month') return setAnchor(toISO(new Date(a.getFullYear(), a.getMonth() + dir, 1)))
    if (mode === 'week') return setAnchor(addDays(anchor, dir * 7))
    let d = addDays(dayAnchor, dir)
    while (!show(d)) d = addDays(d, dir)
    setAnchor(d)
  }
  const first = fromISO(cells[0])
  const title =
    mode === 'month'
      ? `${MONTHS[a.getMonth()]} ${a.getFullYear()}`
      : mode === 'week'
        ? `Week of ${MONTHS[first.getMonth()].slice(0, 3)} ${first.getDate()}`
        : `${WEEKDAYS[first.getDay()]}, ${MONTHS[first.getMonth()].slice(0, 3)} ${first.getDate()}`
  const heads = (weekends ? WEEKDAYS : WEEKDAYS.slice(1, 6)).map((w) => w.slice(0, 3))

  return (
    <div className="glass flex h-full flex-col rounded-[2rem] p-3 md:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1">
        {/* on a phone the month and year get a line to themselves */}
        <h3 className="basis-full font-display text-xl md:basis-auto">{title}</h3>
        <div className="flex items-center md:ml-2">
          <button onClick={() => step(-1)} className={`${ctl} w-8`} aria-label="Previous">
            <span className="grid rotate-180 place-items-center">
              <IconChevron />
            </span>
          </button>
          <button onClick={() => setAnchor(today())} className={`${ctl} px-2.5 text-xs text-ink-soft`}>
            Today
          </button>
          <button onClick={() => step(1)} className={`${ctl} w-8`} aria-label="Next">
            <IconChevron />
          </button>
        </div>
        <button
          onClick={toggleWeekends}
          aria-pressed={weekends}
          className="glass-soft ml-auto flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-ink-soft"
          title={weekends ? 'Hide weekends' : 'Show weekends'}
        >
          Weekends
          <span className={`relative h-4 w-7 shrink-0 rounded-full transition ${weekends ? 'bg-lilac-500' : 'bg-ink-faint/40'}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${weekends ? 'left-[0.85rem]' : 'left-0.5'}`} />
          </span>
        </button>
        <div className="glass-soft flex h-8 items-center rounded-full p-0.5 text-xs">
          {(['month', 'week', 'day'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`h-full rounded-full px-3 capitalize transition ${mode === m ? 'bg-lilac-500 text-white shadow' : 'text-ink-soft'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode !== 'day' && !stacked && (
        <div className="mb-1 grid gap-1.5 px-0.5 text-center text-[0.68rem] uppercase tracking-wider text-ink-faint" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {heads.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
      )}
      <div
        className={`grid min-h-0 flex-1 gap-1.5 ${stacked ? 'scroll-soft auto-rows-min overflow-y-auto' : ''}`}
        style={{
          gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: stacked ? undefined : mode === 'month' ? `repeat(${Math.ceil(cells.length / cols)}, minmax(0, 1fr))` : 'minmax(0, 1fr)',
        }}
      >
        {cells.map((d) => (
          <Cell key={d} date={d} tasks={byDate.get(d) ?? []} month={mode === 'month' ? a.getMonth() : null} tall={mode !== 'month'} named={stacked || mode === 'day'} roomy={mode === 'day'} />
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
