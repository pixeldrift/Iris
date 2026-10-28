import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { tint } from '../../core/color'
import { addDays, diffDays, fromISO, MONTHS, today } from '../../core/dates'
import { spanOf } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { IconChevron } from '../icons'
import { Tip } from '../Tip'
import { useLeaveClass, useVisibleTasks } from '../useVisible'

const DAY_W = 38
const MIN_W = 10
const MAX_W = 110
const DAYS = 150
const LABEL_W = 190

type Preview = { id: string; start: string; end: string }

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
  const base = spanOf(task)!
  const span = preview && preview.id === task.id ? preview : { start: base.start, end: base.end }
  const left = diffDays(winStart, span.start) * dayW
  const width = (diffDays(span.start, span.end) + 1) * dayW

  const begin = (mode: 'move' | 'left' | 'right') => (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const sx = e.clientX
    let moved = false
    let cur: Preview = { id: task.id, ...base }
    const move = (ev: PointerEvent) => {
      const ds = Math.round((ev.clientX - sx) / dayW)
      if (ds !== 0) moved = true
      let { start, end } = base
      if (mode === 'move') {
        start = addDays(start, ds)
        end = addDays(end, ds)
      } else if (mode === 'left') {
        start = addDays(start, ds)
        if (start > end) start = end
      } else {
        end = addDays(end, ds)
        if (end < start) end = start
      }
      cur = { id: task.id, start, end }
      onPreview(cur)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onPreview(null)
      if (!moved) select(task.id)
      else update(task.id, { start: cur.start, due: cur.end })
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
        background: `linear-gradient(90deg, ${tint(hue, 70, 86, .95)}, ${tint(hue, 65, 78, .95)})`,
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
  const scroller = useRef<HTMLDivElement>(null)
  const labelW = legend ? LABEL_W : 0

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
  const hueOf = (t: Task) => folders.find((f) => f.id === t.folderIds[0])?.hue ?? 285
  const nav = 'grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/60'
  const zoomBtn = 'glass-soft grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-white/80'

  return (
    <div className="glass relative flex h-full flex-col rounded-[2rem] p-3 md:p-4">
      <div className="mb-2 flex items-center gap-1 px-1">
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
        <Tip label={legend ? 'Hide the names column' : 'Show the names column'}>
          <button
            role="switch"
            aria-checked={legend}
            onClick={() => setSetting('timelineLegend', !legend)}
            className={`ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs transition ${legend ? 'bg-lilac-500 text-white shadow shadow-lilac-500/30' : 'glass-soft text-ink-soft hover:bg-white/70'}`}
          >
            Legend
          </button>
        </Tip>
      </div>

      <div ref={scroller} className="scroll-soft min-h-0 flex-1 overflow-auto rounded-2xl bg-white/30" style={{ touchAction: 'pan-x pan-y' }}>
        <div style={{ width: labelW + gridW }} className="relative min-h-full">
          {/* header */}
          <div className="sticky top-0 z-20 flex bg-white/70 backdrop-blur-md">
            {legend && <div className="sticky left-0 z-30 shrink-0 bg-white/80" style={{ width: labelW }} />}
            <div className="relative" style={{ width: gridW }}>
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
            </div>
          </div>

          {/* rows */}
          {rows.map((t) => {
            const has = !!spanOf(t)
            const hue = hueOf(t)
            return (
              <div key={t.id} className="flex border-t border-white/60">
                {legend && (
                  <button
                    onClick={() => select(t.id)}
                    className="sticky left-0 z-10 shrink-0 truncate bg-white/70 px-3 text-left text-sm backdrop-blur-md hover:bg-white/90"
                    style={{ width: labelW, height: 44, color: tint(hue, 45, 36) }}
                  >
                    {t.title}
                  </button>
                )}
                <div
                  className="relative"
                  style={{
                    width: gridW,
                    height: 44,
                    backgroundImage: `linear-gradient(90deg, rgb(var(--lr-300)/.18) 1px, transparent 1px)`,
                    backgroundSize: `${dayW}px 100%`,
                    cursor: has ? undefined : 'copy',
                  }}
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
              </div>
            )
          })}
          {rows.length === 0 && <p className="py-16 text-center font-display text-lg italic text-ink-faint" style={{ marginLeft: labelW }}>No tasks to chart.</p>}

          {/* today line */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-lilac-500/60" style={{ left: labelW + todayX }} />
        </div>
      </div>

      <div data-ui className="absolute bottom-5 right-5 z-30 flex items-center gap-1.5 md:bottom-6 md:right-6">
        <Tip label="Zoom out">
          <button onClick={() => zoomAbout(1 / 1.35)} className={zoomBtn}>
            −
          </button>
        </Tip>
        <Tip label="Zoom in">
          <button onClick={() => zoomAbout(1.35)} className={zoomBtn}>
            +
          </button>
        </Tip>
      </div>
    </div>
  )
}
