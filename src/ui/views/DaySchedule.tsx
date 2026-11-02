import { useEffect, useMemo, useRef, useState } from 'react'
import { formatClock } from '../../core/locale'
import { repeatOf } from '../../core/recurrence'
import { columnsFor, DAY_MIN, durationOf, formatDuration, freeGaps, hhmm, spanOnDay } from '../../core/schedule'
import { today } from '../../core/dates'
import { formatTime, effectiveUrgency } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { DoneButton } from '../shared'
import { colorVars, useTaskHue } from '../taskColor'

const PPM = 1.3 // pixels per minute: an hour is 78px
const SNAP = 15
const HOLD_MS = 380
const MIN_PX = 24

type Preview = { id: string; s: number; e: number }

/** One event on the clock: as tall as it lasts; drag to move it, drag its bottom edge to change how long it takes. */
function Block({ task, s, e, col, cols, date, preview, onPreview }: { task: Task; s: number; e: number; col: number; cols: number; date: string; preview: Preview | null; onPreview: (p: Preview | null) => void }) {
  const update = useStore((st) => st.updateTask)
  const select = useStore((st) => st.select)
  const hue = useTaskHue(task)
  const drag = preview && preview.id === task.id ? preview : { s, e }
  const top = drag.s * PPM
  const height = Math.max((drag.e - drag.s) * PPM, MIN_PX)
  const hasEnd = durationOf(task) !== null
  const done = repeatOf(task) ? task.log.includes(date) : task.status === 'done'

  // moving (grab the block) or stretching (grab its bottom edge); a finger must rest on a block a moment before it moves, so scrolling the day never drags it
  const begin = (mode: 'move' | 'resize') => (ev: React.PointerEvent) => {
    ev.stopPropagation()
    if (ev.button !== 0) return
    const y0 = ev.clientY
    const touch = ev.pointerType === 'touch'
    let armed = !touch || mode === 'resize'
    let moved = false
    let cur: Preview = { id: task.id, s, e }
    const timer = armed ? 0 : window.setTimeout(() => ((armed = true), navigator.vibrate?.(8)), HOLD_MS)
    const move = (m: PointerEvent) => {
      const dy = m.clientY - y0
      if (!armed) {
        if (Math.abs(dy) > 8) cleanup() // it was a scroll
        return
      }
      const d = Math.round(dy / PPM / SNAP) * SNAP
      if (Math.abs(dy) > 3) moved = true
      if (mode === 'move') {
        const len = e - s
        const ns = Math.max(0, Math.min(DAY_MIN - len, s + d))
        cur = { id: task.id, s: ns, e: ns + len }
      } else cur = { id: task.id, s, e: Math.max(s + SNAP, Math.min(DAY_MIN - 1, e + d)) }
      onPreview(cur)
    }
    const block = (t: TouchEvent) => armed && t.cancelable && t.preventDefault()
    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cleanup)
      window.removeEventListener('touchmove', block)
      onPreview(null)
    }
    const up = () => {
      cleanup()
      if (!moved) return mode === 'move' ? select(task.id) : undefined
      if (cur.s === s && cur.e === e) return
      // a plain move keeps an open-ended event open-ended; stretching gives it an end
      update(task.id, mode === 'resize' || hasEnd ? { time: hhmm(cur.s), endTime: hhmm(cur.e) } : { time: hhmm(cur.s) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cleanup)
    window.addEventListener('touchmove', block, { passive: false })
  }

  const range = `${formatClock(Math.floor(drag.s / 60), drag.s % 60)} – ${formatClock(Math.floor(drag.e / 60) % 24, drag.e % 60)}`
  const roomy = height >= 46
  return (
    <div
      data-event={task.id}
      onPointerDown={begin('move')}
      onClick={(ev) => ev.stopPropagation()}
      style={{ top, height: height - 2, left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - 3px)`, touchAction: 'pan-y', ...colorVars(hue, effectiveUrgency(task)) }}
      // (a solid white base under the tint, so the hour lines don't show through)
      className={`tint lift-on-press absolute z-10 flex cursor-pointer select-none gap-2 overflow-hidden rounded-xl bg-white px-2 py-1 text-left [-webkit-touch-callout:none] ${done ? 'opacity-60' : ''} ${preview?.id === task.id ? 'z-20 shadow-lg' : ''}`}
      title={`${task.title} · ${range}`}
    >
      {height >= 32 && <DoneButton task={task} size={16} />}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[0.8rem] leading-tight ${done ? 'line-through' : ''}`}>{task.title || 'Untitled'}</span>
        {roomy ? (
          <span className="block truncate text-[0.68rem] text-ink-faint">
            {range}
            {hasEnd || preview?.id === task.id ? ` · ${formatDuration(drag.e - drag.s)}` : ''}
            {task.place ? ` · ${task.place}` : ''}
          </span>
        ) : height >= 32 ? (
          <span className="block truncate text-[0.68rem] text-ink-faint">{formatTime(hhmm(drag.s))}</span>
        ) : null}
      </span>
      <span onPointerDown={begin('resize')} aria-label="Change length" className="absolute inset-x-0 bottom-0 grid h-3 cursor-ns-resize touch-none place-items-center" role="separator">
        <span className="h-0.5 w-6 rounded-full bg-ink-faint/40" />
      </span>
    </div>
  )
}

/**
 * A day laid out by the clock: events are blocks as tall as they last, side by side when they overlap, with a line for now
 * and the free stretches between them (tap one, or any empty spot, to plan something there).
 */
export function DaySchedule({ date, tasks }: { date: string; tasks: { task: Task; deadline: boolean }[] }) {
  const addTask = useStore((s) => s.addTask)
  const select = useStore((s) => s.select)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [now, setNow] = useState(() => new Date())
  const box = useRef<HTMLDivElement>(null)
  const isToday = date === today()
  useEffect(() => {
    if (!isToday) return
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [isToday])

  const events = useMemo(
    () => tasks.filter((t) => !t.deadline).flatMap(({ task }) => { const sp = spanOnDay(task); return sp ? [{ task, ...sp }] : [] }),
    [tasks],
  )
  const cols = useMemo(() => columnsFor(events), [events])
  const gaps = useMemo(() => freeGaps(events), [events])
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const first = Math.min(8 * 60, ...events.map((e) => e.s), isToday ? nowMin : DAY_MIN)
  const last = Math.max(18 * 60, ...events.map((e) => e.e), isToday ? nowMin : 0)
  const from = Math.max(0, Math.floor((first - 30) / 60) * 60)
  const to = Math.min(DAY_MIN, Math.ceil((last + 30) / 60) * 60)
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60)

  // open at the right place: now, or the first thing planned
  useEffect(() => {
    const el = box.current?.parentElement
    if (!el) return
    const target = isToday ? nowMin : events.length ? Math.min(...events.map((e) => e.s)) : 8 * 60
    el.scrollTop = Math.max(0, (target - from - 60) * PPM)
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const plan = (at: number, room = DAY_MIN) => {
    const s = Math.max(0, Math.min(DAY_MIN - SNAP, Math.floor(at / SNAP) * SNAP))
    const e = Math.min(s + 60, s + room, DAY_MIN - 1)
    select(addTask({ title: 'New event', kind: 'event', day: date, time: hhmm(s), endTime: hhmm(e) }))
  }

  return (
    <div
      ref={box}
      data-day-schedule
      className="relative ml-12 mr-1 select-none"
      style={{ height: (to - from) * PPM }}
      onClick={(ev) => {
        const r = ev.currentTarget.getBoundingClientRect()
        plan(from + (ev.clientY - r.top) / PPM - 15)
      }}
    >
      {hours.map((m) => (
        <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-ink-faint/20" style={{ top: (m - from) * PPM }}>
          {m < to && !(isToday && Math.abs(m - nowMin) < 14) && (
            <span className="absolute -left-12 w-10 -translate-y-1/2 pr-1 text-right text-[0.66rem] tabular-nums text-ink-faint">{formatClock(Math.floor(m / 60) % 24, 0)}</span>
          )}
        </div>
      ))}
      <div className="absolute inset-0" style={{ top: -from * PPM }}>
        {gaps.map((g) => (
          <button
            key={g.s}
            onClick={(ev) => {
              ev.stopPropagation()
              plan(g.s, g.e - g.s)
            }}
            style={{ top: g.s * PPM + 2, height: (g.e - g.s) * PPM - 4 }}
            className="group absolute inset-x-1 grid place-items-center rounded-xl text-[0.68rem] text-ink-faint/80 transition hover:bg-lilac-100/50"
            aria-label={`Free for ${formatDuration(g.e - g.s)}, plan something`}
          >
            <span className="rounded-full px-2 py-0.5 opacity-70 group-hover:opacity-100">free · {formatDuration(g.e - g.s)}</span>
          </button>
        ))}
        {events.map((ev, i) => (
          <Block key={ev.task.id} task={ev.task} s={ev.s} e={ev.e} col={cols[i].col} cols={cols[i].cols} date={date} preview={preview} onPreview={setPreview} />
        ))}
        {isToday && (
          <div className="pointer-events-none absolute -left-12 right-0 z-30 flex items-center" style={{ top: nowMin * PPM }} aria-label="Now">
            <span className="w-11 pr-1 text-right text-[0.62rem] font-semibold tabular-nums text-lilac-600">{formatClock(now.getHours(), now.getMinutes())}</span>
            <span className="h-2 w-2 -translate-x-0.5 rounded-full bg-lilac-500 shadow" />
            <span className="h-px flex-1 bg-lilac-500/80" />
          </div>
        )}
      </div>
    </div>
  )
}
