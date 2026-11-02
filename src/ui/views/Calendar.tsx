import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tint } from '../../core/color'
import { addDays, dayHint, fromISO, monthGrid, MONTHS, startOfWeek, toISO, today, WEEKDAYS } from '../../core/dates'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { IconBriefcase, IconChevron, IconClose, IconPlus, KindIcon } from '../icons'
import { SPRING } from '../lift'
import { colorVars, useTaskHue } from '../taskColor'
import { DoneButton, useTaskDrag } from '../shared'
import { repeatOf, taskOnDate } from '../../core/recurrence'
import { formatTime, plannedDate } from '../../core/tasks'
import { useIsMobile, useLandscapePhone } from '../useMedia'
import { useLeaveClass, useVisibleTasks } from '../useVisible'

function Chip({ task, deadline = false, loggedOn, rich = false }: { task: Task; deadline?: boolean; loggedOn?: string; rich?: boolean }) {
  // an occurrence of a repeating item that came and went without being ticked: still on the calendar (for the record), just quieter
  const missed = !!loggedOn && loggedOn < today() && !task.log.includes(loggedOn)
  const el = useRef<HTMLDivElement>(null)
  const onPointerDown = useTaskDrag(task, el)
  const folders = useStore((s) => s.folders)
  const hue = folders.find((f) => f.id === task.folderIds[0])?.hue ?? 285
  const leave = useLeaveClass(task)
  const isDone = loggedOn ? task.log.includes(loggedOn) : task.status === 'done'
  return (
    <div
      ref={el}
      data-lift-id={deadline ? undefined : `task:${task.id}`}
      onPointerDown={(e) => {
        e.stopPropagation()
        // not as a "handle": a finger must rest on it for a moment before it lifts, so touching to scroll the days never drags an item
        onPointerDown(e)
      }}
      style={deadline ? { touchAction: 'pan-y', background: 'transparent', boxShadow: `inset 0 0 0 1px ${tint(hue, 45, 60, .55)}`, color: `${tint(hue, 35, 35)}` } : { touchAction: 'pan-y', background: `${tint(hue, 70, 87, .9)}`, color: `${tint(hue, 35, 28)}` }}
      className={`pop-in flex cursor-pointer select-none items-center gap-1.5 rounded-lg py-0.5 [-webkit-touch-callout:none] text-[0.72rem] leading-snug transition hover:brightness-95 ${rich ? 'px-1' : 'truncate px-1.5'} ${isDone ? 'opacity-60' : ''} ${missed ? 'opacity-55 outline-dashed outline-1 -outline-offset-1 outline-ink-faint/50' : ''} ${leave}`}
      title={deadline ? `${task.title} (due)` : task.title}
    >
      {rich && <DoneButton task={task} size={16} />}
      <span className={`min-w-0 flex-1 truncate ${isDone ? 'line-through' : ''}`}>
        {deadline ? '⚑ ' : ''}
        {task.kind === 'event' && task.time ? `${formatTime(task.time)} ` : ''}
        {task.title}
      </span>
      {rich && (
        <span className="shrink-0 opacity-60" aria-hidden>
          <KindIcon kind={task.kind} size={12} />
        </span>
      )}
    </div>
  )
}

/** An item in the style of the list view: its group's tint, a checkbox on the left and its type on the right. */
function ItemRow({ task, deadline = false, loggedOn, onOpen, drag = false }: { task: Task; deadline?: boolean; loggedOn?: string; onOpen?: () => void; drag?: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const select = useStore((s) => s.select)
  const hue = useTaskHue(task)
  const pointer = useTaskDrag(task, el, () => (onOpen ? onOpen() : select(task.id)))
  const isDone = loggedOn ? task.log.includes(loggedOn) : task.status === 'done'
  const missed = !!loggedOn && loggedOn < today() && !task.log.includes(loggedOn)
  return (
    <div
      ref={el}
      data-lift-id={deadline || !drag ? undefined : `task:${task.id}`}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (drag) pointer(e) // (a touch must rest a moment before the item lifts, so scrolling the day never drags it)
      }}
      onClick={() => {
        if (!drag) {
          if (onOpen) onOpen()
          else select(task.id)
        }
      }}
      style={{ touchAction: 'pan-y', ...colorVars(hue, task.urgency) }}
      className={`tint lift-on-press relative flex cursor-pointer select-none items-center gap-2.5 rounded-2xl px-3 py-2.5 ${missed ? 'opacity-60' : ''}`}
      title={deadline ? `${task.title} (due)` : task.title}
    >
      <DoneButton task={task} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${isDone ? 'text-ink-faint line-through' : ''}`}>
          {deadline ? '⚑ ' : ''}
          {task.title || 'Untitled'}
        </span>
        {task.kind === 'event' && task.time && <span className="block text-xs text-ink-faint">{formatTime(task.time)}</span>}
      </span>
      <span className="shrink-0 text-lilac-600/70" aria-hidden title={task.kind}>
        <KindIcon kind={task.kind} size={16} />
      </span>
    </div>
  )
}

/** One item as a coloured dot (its group's colour): in the month view that is all there is room for. */
function Dot({ task, deadline, loggedOn }: { task: Task; deadline: boolean; loggedOn?: string }) {
  const folders = useStore((s) => s.folders)
  const hue = folders.find((f) => f.id === task.folderIds[0])?.hue ?? 285
  const done = loggedOn ? task.log.includes(loggedOn) : task.status === 'done'
  return (
    <span
      title={`${task.title}${deadline ? ' (due)' : ''}`}
      className={`h-2 w-2 shrink-0 rounded-full ${done ? 'opacity-40' : ''}`}
      style={deadline ? { boxShadow: `inset 0 0 0 1.5px ${tint(hue, 55, 55)}` } : { background: tint(hue, 62, 62) }}
    />
  )
}

function Cell({
  date,
  tasks,
  month,
  tall,
  named = false,
  roomy = false,
  dots = false,
  rich = false,
  dimmed,
  onOpen,
}: {
  date: string
  tasks: { task: Task; deadline: boolean }[]
  month: number | null
  tall: boolean
  named?: boolean
  roomy?: boolean
  dots?: boolean
  /** checkbox on the left and the item's type on the right (the week and day views) */
  rich?: boolean
  dimmed?: boolean
  /** the month view: tapping the day opens it */
  onOpen?: (date: string, from: DOMRect) => void
}) {
  const { over, active, props } = useDropTarget(`day:${date}`)
  const addTask = useStore((s) => s.addTask)
  const select = useStore((s) => s.select)
  const setScope = useStore((s) => s.setScope)
  const isToday = date === today()
  const d = fromISO(date)
  const dim = dimmed ?? (month !== null && d.getMonth() !== month)
  const max = roomy ? 99 : tall ? 12 : 3
  const box = useRef<HTMLDivElement>(null)
  const open = () => box.current && onOpen?.(date, box.current.getBoundingClientRect())
  return (
    <div
      {...props}
      ref={box}
      onClick={onOpen ? open : undefined}
      className={`group relative flex flex-col gap-1 overflow-hidden rounded-2xl border p-1.5 transition ${onOpen ? 'cursor-pointer hover:bg-white/60' : ''} ${named && !roomy ? 'min-h-[4.5rem] shrink-0' : 'min-h-0'} ${
        over ? 'border-lilac-400 bg-lilac-200/70' : isToday ? 'border-lilac-300 bg-white/70' : 'border-ink-faint/30 bg-white/40 shadow-[0_1px_4px_rgba(90,70,120,0.12)]'
      } ${dim ? 'opacity-50' : ''} ${active && !over ? 'border-dotted border-lilac-300' : ''}`}
    >
      <div className="flex items-center">
        <button
          onClick={(e) => {
            if (onOpen) return // the whole day opens
            e.stopPropagation()
            setScope({ type: 'day', date })
          }}
          className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums ${isToday ? 'bg-lilac-500 text-white' : 'text-ink-soft hover:bg-white/70'}`}
        >
          {d.getDate()}
        </button>
        {named && (
          <span className="ml-2 text-sm text-ink-soft">
            {WEEKDAYS[d.getDay()]}
            {dayHint(date) && <span className="ml-1.5 font-normal italic text-ink-faint">({dayHint(date)})</span>}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            select(addTask({ title: 'New task', due: date }))
          }}
          className="ml-auto rounded-full p-0.5 text-ink-faint opacity-0 transition hover:bg-white/70 hover:text-lilac-600 group-hover:opacity-100"
          aria-label={`Add task on ${date}`}
        >
          <IconPlus size={14} />
        </button>
      </div>
      {dots ? (
        // the month view: at this size words can't be read, so each item is a dot and the day is judged at a glance
        <div
          aria-label={tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'item' : 'items'} on ${date}` : `Nothing on ${date}`}
          role="img"
          className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-1 overflow-hidden px-0.5 text-left"
        >
          {tasks.slice(0, 15).map((t) => (
            <Dot key={t.task.id + (t.deadline ? 'd' : '')} task={t.task} deadline={t.deadline} loggedOn={repeatOf(t.task) ? date : undefined} />
          ))}
          {tasks.length > 15 && <span className="text-[0.62rem] leading-2 text-ink-faint">+{tasks.length - 15}</span>}
        </div>
      ) : roomy ? (
        // the day view: rows like the list view's (room around them, so their rounded corners and lift are never clipped)
        <div className="scroll-soft -mx-0.5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1.5">
          {tasks.map((t) => (
            <ItemRow key={t.task.id + (t.deadline ? 'd' : '')} task={t.task} deadline={t.deadline} loggedOn={repeatOf(t.task) ? date : undefined} drag />
          ))}
          {tasks.length === 0 && <p className="px-2 py-3 text-sm text-ink-faint">Nothing planned for this day.</p>}
        </div>
      ) : (
        <div className="scroll-soft flex min-h-0 flex-col gap-1 overflow-y-auto">
          {tasks.slice(0, max).map((t) => (
            <Chip key={t.task.id + (t.deadline ? 'd' : '')} task={t.task} deadline={t.deadline} loggedOn={repeatOf(t.task) ? date : undefined} rich={rich} />
          ))}
          {tasks.length > max && <span className="px-1 text-[0.68rem] text-ink-faint">+{tasks.length - max} more</span>}
        </div>
      )}
    </div>
  )
}

/**
 * A day, opened from the month view: it grows out of the box that was tapped. Its items are in the list view's style
 * (checkbox on the left, type on the right), the day and date are at the top, and arrows step to the day before or after.
 */
function DayPopup({ date, from, tasksOn, onNav, onClose, onLeave }: { date: string; from: DOMRect | null; tasksOn: (d: string) => { task: Task; deadline: boolean }[]; onNav: (dir: number) => void; onClose: () => void; onLeave: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const select = useStore((s) => s.select)
  const addTask = useStore((s) => s.addTask)
  const items = tasksOn(date)
  const d = fromISO(date)

  // the transform that puts the panel exactly over the box it grew from
  const fromBox = () => {
    const el = panel.current
    if (!el) return null
    const to = el.getBoundingClientRect()
    // grown out of the box that was tapped; with none to grow from (coming back from an item's details) it just springs up
    if (!from) return 'scale(0.9)'
    return `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${Math.max(0.05, from.width / to.width)}, ${Math.max(0.05, from.height / to.height)})`
  }
  useEffect(() => {
    const el = panel.current
    const t = fromBox()
    if (!el || !t) return
    // the springy overshoot used for boxes elsewhere in the app
    el.animate([{ transform: t, opacity: from ? 0.35 : 0, borderRadius: '1rem' }, { transform: 'none', opacity: 1, borderRadius: '2rem' }], { duration: 560, easing: SPRING })
    back.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (closing.current) return
    closing.current = true
    const el = panel.current
    const t = fromBox()
    back.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' })
    if (!el || !t) return onClose()
    const anim = el.animate([{ transform: 'none', opacity: 1, borderRadius: '2rem' }, { transform: t, opacity: 0, borderRadius: '1rem' }], { duration: 300, easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)', fill: 'forwards' })
    anim.onfinish = onClose
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') onNav(-1)
      if (e.key === 'ArrowRight') onNav(1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const arrow = 'grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink transition hover:bg-white/70'
  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center py-3" style={{ paddingLeft: 'max(1rem, var(--safe-l))', paddingRight: 'max(1rem, var(--safe-r))' }}>
      <div ref={back} className="absolute inset-0 bg-ink/15 backdrop-blur-[3px]" onClick={close} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={`${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`} className="glass glass-strong relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[2rem]">
        <header className="px-3 pb-2 pt-3.5">
          <button onClick={close} className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-ink" aria-label="Close">
            <IconClose size={14} />
          </button>
          <h3 className="truncate px-9 text-center font-display text-2xl leading-tight">
            {WEEKDAYS[d.getDay()]}
            {dayHint(date) && <span className="ml-2 text-base font-normal italic text-ink-faint">({dayHint(date)})</span>}
          </h3>
          {/* the arrows share the date's line, away from the close button */}
          <div className="mt-0.5 flex items-center justify-center gap-1">
            <button onClick={() => onNav(-1)} className={arrow} aria-label="Previous day">
              <span className="grid rotate-180 place-items-center">
                <IconChevron size={16} />
              </span>
            </button>
            <p className="min-w-[10.5rem] text-center text-sm text-ink-soft">
              {MONTHS[d.getMonth()]} {d.getDate()}, {d.getFullYear()}
            </p>
            <button onClick={() => onNav(1)} className={arrow} aria-label="Next day">
              <IconChevron size={16} />
            </button>
          </div>
        </header>
        <div className="scroll-soft min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-2 pt-1">
          {items.map((t) => (
            <ItemRow
              key={t.task.id + (t.deadline ? 'd' : '')}
              task={t.task}
              deadline={t.deadline}
              loggedOn={repeatOf(t.task) ? date : undefined}
              onOpen={() => {
                // the details open over the day; closing them brings the day back
                onLeave()
                select(t.task.id)
              }}
            />
          ))}
          {items.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">Nothing planned for this day.</p>}
        </div>
        <footer className="border-t border-white/60 px-3 py-2.5">
          <button
            onClick={() => {
              onLeave()
              select(addTask({ title: 'New task', due: date }))
            }}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-lilac-700 transition hover:bg-lilac-100/80"
          >
            <IconPlus size={14} /> Add an item
          </button>
        </footer>
      </div>
    </div>,
    document.body,
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
  const monthRolling = useStore((s) => s.settings.monthStyle === 'rolling')
  const weekRolling = useStore((s) => s.settings.weekStyle === 'rolling')
  const land = useLandscapePhone()
  const selectedId = useStore((s) => s.selectedId)
  const [pop, setPop] = useState<{ date: string; from: DOMRect | null } | null>(null)
  // an item opened from the day popup: when its details close, the day comes back
  const [resume, setResume] = useState<string | null>(null)
  useEffect(() => {
    if (resume && selectedId === null) {
      setPop({ date: resume, from: null })
      setResume(null)
    }
  }, [selectedId, resume])
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
      if (repeatOf(t)) continue // a series is placed on each of its occurrences, below
      const when = plannedDate(t)
      if (when) put(when, t, false)
      if (t.day && t.due && t.due !== t.day) put(t.due, t, true)
    }
    return m
  }, [visible])
  const series = visible.filter((t) => repeatOf(t))
  const tasksOn = (d: string) => [...(byDate.get(d) ?? []), ...series.filter((t) => taskOnDate(t, d)).map((task) => ({ task, deadline: false }))]
  const unscheduled = visible.filter((t) => !plannedDate(t) && t.status !== 'done')

  // keep the anchor on a visible day when weekends are hidden
  const dayAnchor = show(anchor) ? anchor : addDays(anchor, fromISO(anchor).getDay() === 6 ? -1 : 1)
  const a = fromISO(anchor)
  const rollEnd = addDays(anchor, 29)
  const rollGrid = () => {
    // whole weeks from the one the window starts in to the one it ends in
    const out: string[] = []
    for (let d = startOfWeek(anchor); d <= addDays(startOfWeek(rollEnd), 6); d = addDays(d, 1)) out.push(d)
    return out
  }
  // the real month's grid has only the weeks the month needs, not an extra one beyond it
  const monthWeeks = () => {
    const g = monthGrid(a.getFullYear(), a.getMonth())
    while (g.length > 7 && g.slice(-7).every((d) => fromISO(d).getMonth() !== a.getMonth())) g.length -= 7
    return g
  }
  const rollingMonth = mode === 'month' && monthRolling
  const rollingWeek = mode === 'week' && weekRolling
  const cells =
    mode === 'month'
      ? (rollingMonth ? rollGrid() : monthWeeks()).filter(show)
      : mode === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(rollingWeek ? anchor : startOfWeek(anchor), i)).filter(show)
        : [dayAnchor]
  const cols = mode === 'day' ? 1 : weekends ? 7 : 5
  const stacked = mode === 'week' && mobile // seven slim columns can't show anything on a phone: stack the days
  const step = (dir: number) => {
    if (rollingMonth) return setAnchor(addDays(anchor, dir * 28))
    if (rollingWeek) return setAnchor(addDays(anchor, dir * 7))
    if (mode === 'month') return setAnchor(toISO(new Date(a.getFullYear(), a.getMonth() + dir, 1)))
    if (mode === 'week') return setAnchor(addDays(anchor, dir * 7))
    let d = addDays(dayAnchor, dir)
    while (!show(d)) d = addDays(d, dir)
    setAnchor(d)
  }
  const first = fromISO(cells[0])
  const short = (iso: string) => `${MONTHS[fromISO(iso).getMonth()].slice(0, 3)} ${fromISO(iso).getDate()}`
  const title =
    rollingMonth
      ? anchor === today()
        ? 'Next 30 days'
        : `${short(anchor)} – ${short(rollEnd)}`
      : mode === 'month'
      ? `${MONTHS[a.getMonth()]} ${a.getFullYear()}`
      : rollingWeek
        ? anchor === today()
          ? 'Next 7 days'
          : `${short(anchor)} – ${short(addDays(anchor, 6))}`
        : mode === 'week'
          ? `Week of ${MONTHS[first.getMonth()].slice(0, 3)} ${first.getDate()}`
        : `${WEEKDAYS[first.getDay()]}, ${MONTHS[first.getMonth()].slice(0, 3)} ${first.getDate()}`
  const heads = cells.slice(0, cols).map((d) => ({ name: WEEKDAYS[fromISO(d).getDay()], hint: dayHint(d), key: d }))

  // tapping a day in the month view opens it; its arrows step to the neighbouring days
  const popNav = (dir: number) =>
    setPop((p) => {
      if (!p) return p
      let d = addDays(p.date, dir)
      while (!show(d)) d = addDays(d, dir)
      return { date: d, from: null }
    })
  const dimmedFor = (d: string) => (rollingMonth ? d < anchor || d > rollEnd : undefined)

  return (
    <div className="glass flex h-full flex-col rounded-[2rem] p-3 md:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1">
        {/* on a phone the month and year get a line to themselves */}
        <h3 className="order-1 min-w-0 flex-1 font-display text-xl md:flex-none">{title}</h3>
        <div className="order-3 flex items-center md:ml-2">
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
        {/* how you look at it first (month, week, day); then the details of that view */}
        <div className="glass-soft order-4 ml-auto flex h-8 items-center rounded-full p-0.5 text-xs">
          {(['month', 'week', 'day'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`h-full rounded-full px-2.5 capitalize transition md:px-3 ${mode === m ? 'bg-lilac-500 text-white shadow' : 'text-ink-soft'}`}>
              {m}
            </button>
          ))}
        </div>
        {mode !== 'day' && (
          // business days only: weekends are left out while it is on
          <>
          <button
            onClick={toggleWeekends}
            aria-pressed={!weekends}
            aria-label="Business days only"
            title={weekends ? 'Show business days only' : 'Show weekends too'}
            className={`${ctl} order-2 w-8 md:order-5 ${weekends ? 'text-ink-soft' : 'bg-lilac-500 text-white shadow shadow-lilac-500/30 hover:bg-lilac-600'}`}
          >
            <IconBriefcase size={17} />
          </button>
          {/* on a phone the controls below start on a new line */}
          <span aria-hidden className="order-2 basis-full md:hidden" />
          </>
        )}
      </div>

      {mode !== 'day' && !stacked && (
        <div className="mb-1 grid gap-1.5 px-0.5 text-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {heads.map((h) =>
            mode === 'week' ? (
              <span key={h.key} className="truncate text-[0.68rem] uppercase tracking-wider text-ink-faint">
                {h.name.slice(0, 3)}
                {h.hint && <span className="ml-1 text-[0.68rem] normal-case italic tracking-normal">({h.hint})</span>}
              </span>
            ) : (
              <span key={h.key} className="text-[0.68rem] uppercase tracking-wider text-ink-faint">
                {h.name.slice(0, 3)}
              </span>
            ),
          )}
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
          <Cell
            key={d}
            date={d}
            tasks={tasksOn(d)}
            month={mode === 'month' && !rollingMonth ? a.getMonth() : null}
            dimmed={dimmedFor(d)}
            tall={mode !== 'month'}
            named={stacked || mode === 'day'}
            roomy={mode === 'day'}
            dots={mode === 'month'}
            rich={mode === 'week'}
            onOpen={mode === 'month' ? (date, from) => setPop({ date, from }) : undefined}
          />
        ))}
      </div>
      {pop && (
        <DayPopup
          date={pop.date}
          from={pop.from}
          tasksOn={tasksOn}
          onNav={popNav}
          onClose={() => setPop(null)}
          onLeave={() => {
            setResume(pop.date)
            setPop(null)
          }}
        />
      )}

      {unscheduled.length > 0 && !land && (
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
