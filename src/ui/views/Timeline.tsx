import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { tint } from '../../core/color'
import { addDays, diffDays, fromISO, MONTHS, today } from '../../core/dates'
import { formatClock } from '../../core/locale'
import { spanOf } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { IconChevron } from '../icons'
import { Tip } from '../Tip'
import { useLeaveClass, useVisibleTasks } from '../useVisible'
import { ZoomControl } from '../ZoomControl'

const DAY_W = 38
const MIN_W = 10
const MAX_W = 1600
const DAYS = 150
const LABEL_W = 190
const ROW_H = 44
/** From this many pixels per day on, hours appear and bars can start and end between midnights. */
const FINE_W = 240
const DAY_MIN = 1440

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
/** Minutes between hour lines, and the step bars snap to, for a zoom. */
const lineStep = (w: number) => (w >= 960 ? 60 : w >= 480 ? 180 : 360)
const snapStep = (w: number) => (w >= 960 ? 15 : w >= 480 ? 30 : 60)

/** Where a task's bar starts and ends, in minutes from the window's first midnight. Whole days until zoomed in. */
function geometry(task: Task, winStart: string, fine: boolean): { s: number; e: number } {
  const span = spanOf(task)!
  const si = diffDays(winStart, span.start)
  const ei = diffDays(winStart, span.end)
  if (!fine) return { s: si * DAY_MIN, e: (ei + 1) * DAY_MIN }
  const startMin = task.time ? toMin(task.time) : 0
  let endMin = task.endTime ? toMin(task.endTime) : task.time ? Math.min(startMin + 60, DAY_MIN) : DAY_MIN
  if (endMin >= DAY_MIN - 1) endMin = DAY_MIN
  const s = si * DAY_MIN + startMin
  return { s, e: Math.max(ei * DAY_MIN + endMin, s + 15) }
}

type Preview = { id: string; s: number; e: number }

/** An end grip: just a dot, since it stretches the bar rather than moving it. */
function Dot() {
  return <span className="block h-1.5 w-1.5 rounded-full bg-current" />
}

function Bar({ task, winStart, dayW, legend, onPreview, preview }: { task: Task; winStart: string; dayW: number; legend: boolean; onPreview: (p: Preview | null) => void; preview: Preview | null }) {
  const update = useStore((s) => s.updateTask)
  const select = useStore((s) => s.select)
  const folders = useStore((s) => s.folders)
  const hue = folders.find((f) => f.id === task.folderIds[0])?.hue ?? 285
  const leave = useLeaveClass(task)
  const fine = dayW >= FINE_W
  const base = geometry(task, winStart, fine)
  const g = preview && preview.id === task.id ? preview : base
  const left = (g.s / DAY_MIN) * dayW
  const width = ((g.e - g.s) / DAY_MIN) * dayW

  const begin = (mode: 'move' | 'left' | 'right') => (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const sx = e.clientX
    const snap = fine ? snapStep(dayW) : DAY_MIN
    let moved = false
    let cur: Preview = { id: task.id, ...base }
    const move = (ev: PointerEvent) => {
      const d = Math.round((((ev.clientX - sx) / dayW) * DAY_MIN) / snap) * snap
      if (d !== 0) moved = true
      let { s, e: end } = base
      if (mode === 'move') {
        s += d
        end += d
      } else if (mode === 'left') s = Math.min(s + d, end - snap)
      else end = Math.max(end + d, s + snap)
      cur = { id: task.id, s, e: end }
      onPreview(cur)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onPreview(null)
      if (!moved) return select(task.id)
      const sd = Math.floor(cur.s / DAY_MIN)
      const ed = Math.floor((cur.e - 1) / DAY_MIN)
      const dates = { start: addDays(winStart, sd), due: addDays(winStart, ed) }
      if (!fine) return update(task.id, dates)
      // zoomed in: the hours are part of the plan too (whole days need none)
      const sm = cur.s - sd * DAY_MIN
      const em = cur.e - ed * DAY_MIN
      const whole = sm === 0 && em === DAY_MIN
      update(task.id, { ...dates, time: whole ? null : hhmm(sm), endTime: whole ? null : em === DAY_MIN ? '23:59' : hhmm(em) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      onPointerDown={begin('move')}
      className={`absolute top-1.5 flex h-8 cursor-grab touch-none items-center overflow-hidden rounded-full px-5 text-xs shadow-sm ring-1 ring-white/80 transition-[box-shadow] hover:shadow-md ${task.status === 'done' ? 'opacity-50' : ''} ${leave}`}
      style={{
        left,
        width,
        background: `linear-gradient(90deg, ${tint(hue, 70, 86, 0.95)}, ${tint(hue, 65, 78, 0.95)})`,
        color: `${tint(hue, 35, 25)}`,
      }}
    >
      <span onPointerDown={begin('left')} className="absolute inset-y-0 left-0 flex w-4 cursor-ew-resize items-center justify-start pl-1.5 opacity-55" aria-hidden>
        <Dot />
      </span>
      {legend ? (
        // the names live in the legend, so the bar only says "I can be dragged"
        <span className="pointer-events-none mx-auto opacity-45" aria-hidden>
          <svg width="22" height="10" viewBox="0 0 22 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 5h18M5 2 2 5l3 3M17 2l3 3-3 3" />
          </svg>
        </span>
      ) : (
        <span className="truncate px-1">{task.title}</span>
      )}
      <span onPointerDown={begin('right')} className="absolute inset-y-0 right-0 flex w-4 cursor-ew-resize items-center justify-end pr-1.5 opacity-55" aria-hidden>
        <Dot />
      </span>
    </div>
  )
}

const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, w))

export function Timeline() {
  const visible = useVisibleTasks()
  const update = useStore((s) => s.updateTask)
  const select = useStore((s) => s.select)
  const folders = useStore((s) => s.folders)
  const legend = useStore((s) => s.settings.timelineLegend)
  const setSetting = useStore((s) => s.setSetting)
  const t0 = today()
  const [winStart, setWinStart] = useState(addDays(t0, -7))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dayW, setDayW] = useState(DAY_W)
  const [scrollX, setScrollX] = useState({ left: 0, width: 1000 })
  const scroller = useRef<HTMLDivElement>(null)
  const labelW = legend ? LABEL_W : 0
  const fine = dayW >= FINE_W
  const headerH = fine ? 68 : 48

  // Zoom is horizontal only. Keep the day under the pointer (or the middle of the view) where it was.
  const anchor = useRef<{ days: number; fx: number } | null>(null)
  const cur = useRef({ dayW, labelW })
  cur.current = { dayW, labelW }
  const zoomAbout = (factor: number, fx?: number) => {
    const el = scroller.current
    if (!el) return
    const { dayW: w0, labelW: lw } = cur.current
    const w1 = clampW(w0 * factor)
    if (w1 === w0) return
    const x = fx ?? (el.clientWidth + lw) / 2
    anchor.current = { days: (el.scrollLeft + x - lw) / w0, fx: x }
    cur.current = { dayW: w1, labelW: lw } // so a fast scrub of several steps in one frame compounds
    setDayW(w1)
  }
  useLayoutEffect(() => {
    const el = scroller.current
    const a = anchor.current
    if (!el || !a) return
    anchor.current = null
    el.scrollLeft = a.days * dayW + labelW - a.fx
  }, [dayW, labelW])
  const zoomRef = useRef(zoomAbout)
  zoomRef.current = zoomAbout

  // what part of the timeline is on screen (hour labels are only drawn for that)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let raf = 0
    const read = () => {
      raf = 0
      setScrollX({ left: el.scrollLeft, width: el.clientWidth })
    }
    const on = () => !raf && (raf = requestAnimationFrame(read))
    read()
    el.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      el.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [])
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) setScrollX({ left: el.scrollLeft, width: el.clientWidth })
  }, [dayW, labelW])

  // pinch (two fingers) and ctrl/cmd + wheel
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let last = 0
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = (t: TouchList) => (t[0].clientX + t[1].clientX) / 2 - el.getBoundingClientRect().left
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) last = spread(e.touches)
    }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !last) return
      if (e.cancelable) e.preventDefault()
      const d = spread(e.touches)
      zoomRef.current(d / last, mid(e.touches))
      last = d
    }
    const end = () => (last = 0)
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomRef.current(Math.exp(-e.deltaY * 0.01), e.clientX - el.getBoundingClientRect().left)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('wheel', wheel)
    }
  }, [])

  const rows = useMemo(() => {
    const vis = visible
    const dated = vis.filter((t) => spanOf(t)).sort((a, b) => spanOf(a)!.start.localeCompare(spanOf(b)!.start))
    const undated = vis.filter((t) => !spanOf(t) && t.status !== 'done')
    return [...dated, ...undated]
  }, [visible])

  const days = Array.from({ length: DAYS }, (_, i) => addDays(winStart, i))
  const todayX = diffDays(winStart, t0) * dayW + dayW / 2
  const gridW = DAYS * dayW
  // zoomed far out, only some day numbers fit
  const every = dayW >= 26 ? 1 : dayW >= 17 ? 2 : 7

  const months: { label: string; x: number; w: number }[] = []
  days.forEach((d, i) => {
    const dt = fromISO(d)
    const last = months[months.length - 1]
    if (!last || last.label !== `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`) months.push({ label: `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`, x: i * dayW, w: dayW })
    else last.w += dayW
  })

  // hour labels for the days on screen
  const step = lineStep(dayW)
  const firstDay = Math.max(0, Math.floor((scrollX.left - labelW) / dayW) - 1)
  const lastDay = Math.min(DAYS - 1, Math.ceil((scrollX.left + scrollX.width) / dayW) + 1)
  const hourMarks: { x: number; label: string; key: string }[] = []
  if (fine) {
    for (let d = firstDay; d <= lastDay; d++)
      for (let m = step; m < DAY_MIN; m += step) hourMarks.push({ key: `${d}:${m}`, x: d * dayW + (m / DAY_MIN) * dayW, label: formatClock(Math.floor(m / 60), m % 60) })
  }

  const hueOf = (t: Task) => folders.find((f) => f.id === t.folderIds[0])?.hue ?? 285
  const nav = 'grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/60'
  const lines = [`linear-gradient(90deg, rgb(var(--lr-300)/.22) 1px, transparent 1px)`]
  const sizes = [`${dayW}px 100%`]
  if (fine) {
    lines.push(`linear-gradient(90deg, rgb(var(--lr-300)/.12) 1px, transparent 1px)`)
    sizes.push(`${(step / DAY_MIN) * dayW}px 100%`)
  }

  return (
    <div className="glass relative flex h-full flex-col rounded-[2rem] p-3 md:p-4">
      <div className="mb-2 flex items-center gap-1 px-1">
        <Tip label={legend ? 'Hide the names column' : 'Show the names column'}>
          <button
            role="switch"
            aria-checked={legend}
            onClick={() => setSetting('timelineLegend', !legend)}
            className={`mr-2 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs transition ${legend ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'glass-soft text-ink-soft hover:bg-white/70'}`}
          >
            Legend
          </button>
        </Tip>
        <button onClick={() => setWinStart(addDays(winStart, -28))} className={nav} aria-label="Earlier">
          <span className="inline-grid rotate-180 place-items-center">
            <IconChevron />
          </span>
        </button>
        <button
          onClick={() => {
            setWinStart(addDays(t0, -7))
            scroller.current?.scrollTo({ left: 0, behavior: 'smooth' })
          }}
          className="grid h-8 shrink-0 place-items-center rounded-full px-2.5 text-xs text-ink-soft hover:bg-white/60"
        >
          Today
        </button>
        <button onClick={() => setWinStart(addDays(winStart, 28))} className={nav} aria-label="Later">
          <span className="inline-grid place-items-center">
            <IconChevron />
          </span>
        </button>
        <span className="ml-2 hidden min-w-0 flex-1 truncate text-[0.65rem] text-ink-faint sm:block">drag bars to shift · drag ends to stretch · pinch to zoom</span>
      </div>

      <div ref={scroller} className="scroll-soft min-h-0 flex-1 overflow-auto rounded-2xl bg-white/30" style={{ touchAction: 'pan-x pan-y' }}>
        <div className="flex min-h-full" style={{ width: labelW + gridW }}>
          {/* names: a column of its own, to the bottom, with a blank corner so it never sits over the dates */}
          {legend && (
            <div className="sticky left-0 z-30 shrink-0 bg-white/95" style={{ width: labelW }}>
              <div className="sticky top-0 z-10 bg-white/90" style={{ height: headerH }} />
              {rows.map((t) => (
                <button
                  key={t.id}
                  onClick={() => select(t.id)}
                  className="block w-full truncate border-t border-white/60 px-3 text-left text-sm hover:bg-white/60"
                  style={{ height: ROW_H, color: tint(hueOf(t), 45, 36) }}
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}

          <div className="relative shrink-0" style={{ width: gridW }}>
            {/* day lines (and hour lines when zoomed in) run the whole height, rows or not */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: headerH, backgroundImage: lines.join(','), backgroundSize: sizes.join(',') }} />

            <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-md" style={{ height: headerH }}>
              <div className="relative h-6">
                {months.map((m) => (
                  <span key={m.label} className="absolute top-1 truncate pl-2 text-[0.7rem] font-medium text-lilac-700" style={{ left: m.x, width: m.w }}>
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="flex">
                {days.map((d, i) => {
                  const dt = fromISO(d)
                  return (
                    <span
                      key={d}
                      className={`grid shrink-0 place-items-center overflow-hidden pb-1 text-[0.65rem] tabular-nums ${d === t0 ? 'font-bold text-lilac-600' : 'text-ink-faint'}`}
                      style={{ width: dayW }}
                    >
                      {i % every === 0 || d === t0 ? dt.getDate() : ''}
                    </span>
                  )
                })}
              </div>
              {fine && (
                <div className="relative h-4">
                  {hourMarks.map((h) => (
                    <span key={h.key} className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[0.6rem] tabular-nums text-ink-faint/80" style={{ left: h.x }}>
                      {h.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {rows.map((t) => {
              const has = !!spanOf(t)
              return (
                <div
                  key={t.id}
                  className="relative border-t border-white/60"
                  style={{ height: ROW_H, cursor: has ? undefined : 'copy' }}
                  onClick={(e) => {
                    if (has) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const day = addDays(winStart, Math.floor((e.clientX - rect.left) / dayW))
                    update(t.id, { start: day, due: addDays(day, 2) })
                  }}
                >
                  {has ? (
                    <Bar task={t} winStart={winStart} dayW={dayW} legend={legend} preview={preview} onPreview={setPreview} />
                  ) : (
                    <span className="pointer-events-none absolute left-3 top-3 text-xs italic text-ink-faint">{legend ? 'unscheduled' : `${t.title} · unscheduled`}</span>
                  )}
                </div>
              )
            })}
            {rows.length === 0 && <p className="py-16 text-center font-display text-lg italic text-ink-faint">No tasks to chart.</p>}

            {/* today line */}
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-lilac-500/60" style={{ left: todayX }} />
          </div>
        </div>
      </div>

      <div data-ui className="absolute bottom-5 right-5 z-40 md:bottom-6 md:right-6">
        <ZoomControl onZoom={(f) => zoomAbout(f)} />
      </div>
    </div>
  )
}
