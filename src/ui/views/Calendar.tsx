import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tint } from '../../core/color'
import { addDays, dayHint, fromISO, MONTHS, startOfWeek, toISO, today, WEEKDAYS } from '../../core/dates'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useDropTarget } from '../dnd'
import { IconCheck, IconChevron, IconChevronDown, IconClose, IconPlus, KindIcon } from '../icons'
import { ScrollFade } from '../ScrollFade'
import { SPRING } from '../lift'
import { colorVars, useTaskHue } from '../taskColor'
import { DoneButton, useTaskDrag } from '../shared'
import { repeatOf, taskOnDate } from '../../core/recurrence'
import { formatTime, plannedDate, effectiveUrgency } from '../../core/tasks'
import { spanOnDay } from '../../core/schedule'
import { useIsMobile, useLandscapePhone } from '../useMedia'
import { DaySchedule } from './DaySchedule'
import { MonthScroller, type MonthHandle, type MonthView } from './MonthScroller'
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
      style={{ touchAction: 'pan-y', ...colorVars(hue, effectiveUrgency(task)) }}
      className={`tint lift-on-press relative flex cursor-pointer select-none items-center gap-2.5 rounded-2xl px-3 py-2.5 ${missed ? 'opacity-60' : ''}`}
      title={deadline ? `${task.title} (due)` : task.title}
    >
      <DoneButton task={task} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${isDone ? 'text-ink-faint line-through' : ''}`}>
          {deadline ? '⚑ ' : ''}
          {task.title || 'Untitled'}
        </span>
        {((task.kind === 'event' && task.time) || task.place.trim()) && (
          <span className="block truncate text-xs text-ink-faint">{[task.kind === 'event' && task.time ? formatTime(task.time) : '', task.place.trim()].filter(Boolean).join(' · ')}</span>
        )}
      </span>
      <span className="shrink-0 text-lilac-600/70" aria-hidden title={task.kind}>
        <KindIcon kind={task.kind} size={16} />
      </span>
    </div>
  )
}

/**
 * One item as a small bubble in its group's colour: an outline for something to do, solid for a deadline (the more serious one).
 * A finished one is faded, with a tiny tick inside.
 */
function Dot({ task, deadline, loggedOn }: { task: Task; deadline: boolean; loggedOn?: string }) {
  const folders = useStore((s) => s.folders)
  const hue = folders.find((f) => f.id === task.folderIds[0])?.hue ?? 285
  const done = loggedOn ? task.log.includes(loggedOn) : task.status === 'done'
  return (
    <span
      title={`${task.title}${deadline ? ' (due)' : ''}${done ? ' (done)' : ''}`}
      className={`grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full ${done ? 'opacity-45' : ''}`}
      style={deadline ? { background: tint(hue, 62, 62), color: '#fff' } : { boxShadow: `inset 0 0 0 1.5px ${tint(hue, 55, 55)}`, background: tint(hue, 70, 87, 0.35), color: tint(hue, 55, 40) }}
    >
      {done && <IconCheck size={7} />}
    </span>
  )
}

/** An item with no day yet, in the same tinted look as the items elsewhere; drag it onto a day. */
function UnscheduledBubble({ task }: { task: Task }) {
  const el = useRef<HTMLDivElement>(null)
  const onPointerDown = useTaskDrag(task, el)
  const hue = useTaskHue(task)
  const leave = useLeaveClass(task)
  return (
    <div
      ref={el}
      data-lift-id={`task:${task.id}`}
      onPointerDown={(e) => onPointerDown(e)}
      style={{ touchAction: 'pan-y', ...colorVars(hue, effectiveUrgency(task)) }}
      title={task.title}
      className={`tint lift-on-press h-[1.625rem] max-w-[14rem] cursor-pointer select-none truncate rounded-full px-3 text-xs leading-[1.625rem] [-webkit-touch-callout:none] ${leave}`}
    >
      {task.title || 'Untitled'}
    </div>
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
  plan = false,
  dimmed,
  alt = false,
  monthLabel = null,
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
  /** the day view as a schedule laid out by the clock, not a list */
  plan?: boolean
  dimmed?: boolean
  /** the month grid: months other than the present one are tinted (so having scrolled away shows), and a month's first day carries its name */
  alt?: boolean
  monthLabel?: string | null
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
      className={`group relative flex flex-col ${dots ? 'gap-0.5 rounded-xl p-1' : 'gap-1 rounded-2xl p-1.5'} overflow-hidden border transition ${onOpen ? 'cursor-pointer hover:bg-white/60' : ''} ${named && !roomy ? 'min-h-[4.5rem] shrink-0' : 'min-h-0'} ${
        over ? 'border-lilac-400 bg-lilac-200/70' : isToday ? 'border-lilac-300 bg-white/70' : alt ? 'border-ink-faint/30 bg-lilac-100/55 shadow-[0_1px_4px_rgba(90,70,120,0.12)]' : 'border-ink-faint/30 bg-white/75 shadow-[0_1px_4px_rgba(90,70,120,0.12)]'
      } ${dim ? 'opacity-50' : ''} ${active && !over ? 'border-dotted border-lilac-300' : ''}`}
    >
      <div className="flex items-center">
        <button
          onClick={(e) => {
            if (onOpen) return // the whole day opens
            e.stopPropagation()
            setScope({ type: 'day', date })
          }}
          className={`inline-flex ${dots ? 'h-5 min-w-5 text-[0.7rem]' : 'h-6 min-w-6 text-xs'} items-center justify-center gap-1 rounded-full ${monthLabel ? 'px-1.5' : 'px-1'} tabular-nums ${isToday ? 'bg-lilac-500 text-white' : 'text-ink-soft hover:bg-white/70'}`}
        >
          {monthLabel && <span className={`font-display text-[0.8rem] leading-none ${isToday ? 'text-white' : 'text-ink-soft'}`}>{monthLabel}</span>}
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
      ) : roomy && plan ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          {/* items with no time of their own sit above the clock */}
          {tasks.some((t) => t.deadline || !spanOnDay(t.task)) && (
            <div className="scroll-soft flex max-h-[26%] shrink-0 flex-col gap-1 overflow-y-auto px-0.5 py-0.5">
              {tasks
                .filter((t) => t.deadline || !spanOnDay(t.task))
                .map((t) => (
                  <Chip key={t.task.id + (t.deadline ? 'd' : '')} task={t.task} deadline={t.deadline} loggedOn={repeatOf(t.task) ? date : undefined} rich />
                ))}
            </div>
          )}
          <div className="scroll-soft min-h-0 flex-1 overflow-y-auto pb-2 pt-2">
            <DaySchedule date={date} tasks={tasks} />
          </div>
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

/** The pills of undated items, cut off cleanly after their second row (however wide they happen to wrap). */
function TwoRows({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | undefined>(undefined)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const kids = [...el.children] as HTMLElement[]
      const tops = [...new Set(kids.map((k) => k.offsetTop))].sort((a, b) => a - b)
      const bottom = tops.length > 2 ? tops[1] + kids.find((k) => k.offsetTop === tops[1])!.offsetHeight + 2 : undefined
      setH((p) => (p === bottom ? p : bottom))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])
  return (
    <div ref={box} aria-label="Unscheduled" style={{ maxHeight: h }} className="relative flex flex-wrap content-start items-start gap-1.5 overflow-hidden px-1 py-1">
      {children}
    </div>
  )
}

/** The month's name as the title: when it changes by the arrows the old one slides up and out as the new one comes in from below (or the reverse going back). */
function AnimatedTitle({ text, order, animate }: { text: string; order: string; animate: boolean }) {
  const [t, setT] = useState({ text, order, out: null as string | null, dir: 1, n: 0 })
  useEffect(() => {
    setT((p) => (p.text === text ? p : { text, order, out: animate ? p.text : null, dir: order >= p.order ? 1 : -1, n: p.n + 1 }))
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (t.out === null) return
    const id = window.setTimeout(() => setT((p) => ({ ...p, out: null })), 420)
    return () => window.clearTimeout(id)
  }, [t.n, t.out])
  return (
    <h3 className="relative grid min-w-0 overflow-hidden whitespace-nowrap font-display text-lg leading-tight md:text-xl">
      {t.out !== null && (
        <span key={`o${t.n}`} aria-hidden className={`col-start-1 row-start-1 ${t.dir > 0 ? 'title-out-up' : 'title-out-down'}`}>
          {t.out}
        </span>
      )}
      <span key={`i${t.n}`} className={`col-start-1 row-start-1 ${t.out !== null ? (t.dir > 0 ? 'title-in-up' : 'title-in-down') : ''}`}>
        {t.text}
      </span>
    </h3>
  )
}

export function CalendarView() {
  const visible = useVisibleTasks()
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('month')
  const [anchor, setAnchor] = useState(today())
  // the day as a list of what is on it, or as a schedule by the clock
  const [plan, setPlan] = useState(() => {
    try {
      return localStorage.getItem('lilac-dayplan') === '1'
    } catch {
      return false
    }
  })
  const togglePlan = (v: boolean) => {
    setPlan(v)
    try {
      localStorage.setItem('lilac-dayplan', v ? '1' : '0')
    } catch {
      /* private mode: just for this visit */
    }
  }
  const [weekends, setWeekends] = useState(readWeekends)
  const [undatedOpen, setUndatedOpen] = useState(false)
  // the month is an endless grid you can drag: where it is drawn from, and what is showing now
  const monthRef = useRef<MonthHandle>(null)
  const [monthBase, setMonthBase] = useState(today())
  const [monthView, setMonthView] = useState<MonthView>({ title: '', month: today(), manual: true })
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
  // on a phone held upright hidden weekends are left out; wider, they stay (so the days never stretch too wide) but fade
  const fadeWeekends = !mobile && !weekends
  const show = (d: string) => weekends || fadeWeekends || !isWeekend(d)
  const faded = (d: string) => fadeWeekends && isWeekend(d)

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
  const cells = mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)).filter(show) : [dayAnchor]
  const cols = mode === 'day' ? 1 : weekends || fadeWeekends ? 7 : 5
  const stacked = mode === 'week' && mobile // seven slim columns can't show anything on a phone: stack the days
  // the arrows still slide a whole month at a time
  const goMonth = (iso: string) => {
    monthRef.current?.goTo(iso)
    setAnchor(iso)
  }
  const step = (dir: number) => {
    if (mode === 'month') {
      const m = fromISO(monthView.month)
      return goMonth(toISO(new Date(m.getFullYear(), m.getMonth() + dir, 1)))
    }
    if (mode === 'week') return setAnchor(addDays(anchor, dir * 7))
    let d = addDays(dayAnchor, dir)
    while (!show(d)) d = addDays(d, dir)
    setAnchor(d)
  }
  const first = fromISO(cells[0])
  const title =
    mode === 'month'
      ? monthView.title
      : mode === 'week'
        ? `Week of ${MONTHS[first.getMonth()].slice(0, 3)} ${first.getDate()}`
        : `${WEEKDAYS[first.getDay()]}, ${MONTHS[first.getMonth()].slice(0, 3)} ${first.getDate()}`
  const heads = (mode === 'month' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today()), i)).filter(show) : cells).slice(0, cols).map((d) => ({ name: WEEKDAYS[fromISO(d).getDay()], hint: dayHint(d), key: d, faded: faded(d) }))

  // tapping a day in the month view opens it; its arrows step to the neighbouring days
  const popNav = (dir: number) =>
    setPop((p) => {
      if (!p) return p
      let d = addDays(p.date, dir)
      while (!show(d)) d = addDays(d, dir)
      return { date: d, from: null }
    })

  return (
    <div className="glass flex h-full flex-col rounded-[2rem] p-3 md:p-4">
      {/* upright on a phone: the month and the view toggle on one line, the arrows and Today under the month with the weekends link opposite; wider: all on one line */}
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-1 md:flex md:gap-x-2.5 md:whitespace-nowrap">
        <div className="self-end md:order-1 md:self-auto">
          <AnimatedTitle text={title} order={monthView.month} animate={mode === 'month' && !monthView.manual} />
        </div>
        <div className="glass-soft flex h-7 items-center justify-self-end rounded-full p-0.5 text-xs md:order-3 md:ml-auto md:h-8">
          {(['month', 'week', 'day'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`h-full rounded-full px-1.5 capitalize transition md:px-3 ${mode === m ? 'bg-lilac-500 text-white shadow' : 'text-ink-soft'}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center text-lilac-600 md:order-2">
          <button onClick={() => step(-1)} className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-lilac-100/80" aria-label="Previous">
            <span className="grid rotate-180 place-items-center">
              <IconChevron />
            </span>
          </button>
          <button onClick={() => (mode === 'month' ? goMonth(today()) : setAnchor(today()))} className="whitespace-nowrap rounded-full bg-lilac-100 px-3 py-0.5 text-xs font-medium text-lilac-700 transition hover:bg-lilac-200/80">
            Today
          </button>
          <button onClick={() => step(1)} className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-lilac-100/80" aria-label="Next">
            <IconChevron />
          </button>
        </div>
        {mode === 'day' ? (
          <div className="glass-soft flex h-7 items-center justify-self-end rounded-full p-0.5 text-xs md:order-4 md:h-8" role="group" aria-label="Day layout">
            {([[false, 'List'], [true, 'Schedule']] as const).map(([v, name]) => (
              <button key={name} onClick={() => togglePlan(v)} aria-pressed={plan === v} className={`h-full rounded-full px-2 transition md:px-3 ${plan === v ? 'bg-lilac-500 text-white shadow' : 'text-ink-soft'}`}>
                {name}
              </button>
            ))}
          </div>
        ) : (
          <button onClick={toggleWeekends} aria-pressed={!weekends} className="justify-self-end whitespace-nowrap rounded-full px-1 py-1 text-[0.7rem] text-lilac-600 transition hover:bg-lilac-100/80 md:order-4 md:px-1.5 md:text-xs">
            {weekends ? 'Hide weekends' : 'Show weekends'}
          </button>
        )}
      </div>

      {mode !== 'day' && !stacked && (
        <div className="mb-1 grid gap-1.5 px-0.5 text-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {heads.map((h) =>
            mode === 'week' ? (
              <span key={h.key} className={`truncate text-[0.68rem] uppercase tracking-wider text-ink-faint ${h.faded ? 'opacity-50' : ''}`}>
                {h.name.slice(0, 3)}
                {h.hint && <span className="ml-1 text-[0.68rem] normal-case italic tracking-normal">({h.hint})</span>}
              </span>
            ) : (
              <span key={h.key} className={`text-[0.68rem] uppercase tracking-wider text-ink-faint ${h.faded ? 'opacity-50' : ''}`}>
                {h.name.slice(0, 3)}
              </span>
            ),
          )}
        </div>
      )}
      {mode === 'month' ? (
        <MonthScroller
          ref={monthRef}
          base={monthBase}
          cols={cols}
          show={show}
          onView={setMonthView}
          onRebase={setMonthBase}
          render={(d, info) => <Cell date={d} tasks={tasksOn(d)} month={null} tall={false} dots dimmed={faded(d)} alt={d.slice(0, 7) !== today().slice(0, 7)} monthLabel={info.monthLabel} onOpen={(date, from) => setPop({ date, from })} />}
        />
      ) : (
        <div
          className={`grid min-h-0 flex-1 gap-1.5 ${stacked ? 'scroll-soft auto-rows-min overflow-y-auto' : ''}`}
          style={{
            gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: stacked ? undefined : 'minmax(0, 1fr)',
          }}
        >
          {cells.map((d) => (
            <Cell key={d} date={d} tasks={tasksOn(d)} month={null} dimmed={faded(d)} tall named={stacked || mode === 'day'} roomy={mode === 'day'} plan={mode === 'day' && plan} rich={mode === 'week'} />
          ))}
        </div>
      )}
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
        // things with no day yet, under a line: two rows of them, or (opened) up to a third of the screen, to drag onto a day
        <div className="mt-2 shrink-0 border-t border-ink-faint/40 pt-1">
          <button type="button" onClick={() => setUndatedOpen((o) => !o)} aria-expanded={undatedOpen} className="flex items-center gap-0.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs text-ink-soft transition hover:text-ink">
            <span className={`transition-transform ${undatedOpen ? '' : '-rotate-90'}`}>
              <IconChevronDown size={14} />
            </span>
            Undated:
          </button>
          {undatedOpen ? (
            <ScrollFade maxH="33dvh" className="px-1 py-1">
              <div aria-label="Unscheduled" className="flex flex-wrap content-start items-start gap-1.5">
                {unscheduled.map((t) => (
                  <UnscheduledBubble key={t.id} task={t} />
                ))}
              </div>
            </ScrollFade>
          ) : (
            <TwoRows>
              {unscheduled.map((t) => (
                <UnscheduledBubble key={t.id} task={t} />
              ))}
            </TwoRows>
          )}
        </div>
      )}
    </div>
  )
}
