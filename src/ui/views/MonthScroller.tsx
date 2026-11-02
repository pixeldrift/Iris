import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, diffDays, fromISO, MONTHS, startOfWeek, toISO } from '../../core/dates'

const WEEKS = 60
const BEFORE = 20
const GAP = 6

export interface MonthHandle {
  /** Slide so the week the month starts in is at the top. */
  goTo: (date: string, smooth?: boolean) => void
}

export interface MonthView {
  /** "September 2026", or "Sep–Oct 2026" while two months are on screen */
  title: string
  /** the first of the month that has most of the screen */
  month: string
}

/**
 * The month as an endless grid of weeks: drag it (or scroll it) to look further down or back; the title says which months are
 * showing. A window of weeks around `base` is drawn, and it moves along when the edge is neared.
 */
export const MonthScroller = forwardRef<MonthHandle, { base: string; cols: number; show: (d: string) => boolean; render: (d: string, info: { alt: boolean; monthLabel: string | null }) => React.ReactNode; onView: (v: MonthView) => void; onRebase: (d: string) => void }>(function MonthScroller(
  { base, cols, show, render, onView, onRebase },
  ref,
) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 500 })
  const origin = useMemo(() => startOfWeek(addDays(base, -BEFORE * 7)), [base])
  const days = useMemo(() => Array.from({ length: WEEKS * 7 }, (_, i) => addDays(origin, i)), [origin])
  const colW = (size.w - GAP * (cols - 1)) / cols
  // five rows fit the box on a wide screen; on a phone the days are kept squarish rather than long and thin
  const rowH = Math.max(64, Math.min(Math.floor((size.h - GAP * 4) / 5), Math.round(colW * 1.45)))
  const pitch = rowH + GAP
  const weekOf = useCallback((d: string) => Math.round(diffDays(origin, startOfWeek(d)) / 7), [origin])
  const live = useRef({ pitch, weekOf, onView, onRebase, origin })
  live.current = { pitch, weekOf, onView, onRebase, origin }

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // what is on screen: the title, and the month that has most of it
  const report = useCallback(() => {
    const el = box.current
    if (!el) return
    const { pitch: p, origin: o } = live.current
    const first = Math.max(0, Math.round(el.scrollTop / p))
    // the title goes by the first five weeks showing (a month's worth), however many more fit on a tall screen
    const rows = 5
    const count = new Map<string, number>()
    for (let r = first; r < first + rows; r++)
      for (let c = 0; c < 7; c++) {
        const d = fromISO(addDays(o, r * 7 + c))
        const k = `${d.getFullYear()}-${d.getMonth()}`
        count.set(k, (count.get(k) ?? 0) + 1)
      }
    // a month counts once a full week's worth of its days is showing
    const months = [...count.entries()].filter(([, n]) => n >= 7).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    const list = months.length ? months : [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1)
    const parts = list.map(([k]) => k.split('-').map(Number) as [number, number])
    const major = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0].split('-').map(Number)
    const y0 = parts[0][0]
    const y1 = parts[parts.length - 1][0]
    const title =
      parts.length === 1
        ? `${MONTHS[parts[0][1]]} ${y0}`
        : `${MONTHS[parts[0][1]].slice(0, 3)}${y0 !== y1 ? ` ${y0}` : ''}–${MONTHS[parts[parts.length - 1][1]].slice(0, 3)} ${y1}`
    live.current.onView({ title, month: toISO(new Date(major[0], major[1], 1)) })
  }, [])

  // where to put the scroll when the window of weeks changes (kept the same place, or the starting month)
  const keep = useRef<{ date: string; offset: number } | null>(null)
  const started = useRef(false)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    if (keep.current) {
      el.scrollTop = weekOf(keep.current.date) * pitch + keep.current.offset
      keep.current = null
    } else if (!started.current) {
      el.scrollTop = weekOf(startOfWeek(base)) * pitch
    }
    started.current = true
    report()
  }, [origin, pitch]) // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    goTo: (date, smooth = true) => {
      const el = box.current
      if (!el) return
      const first = toISO(new Date(fromISO(date).getFullYear(), fromISO(date).getMonth(), 1))
      const i = weekOf(first)
      if (i < 3 || i > WEEKS - 10) return void live.current.onRebase(first) // too far from what is drawn: draw around it instead
      el.scrollTo({ top: i * pitch, behavior: smooth ? 'smooth' : 'auto' })
    },
  }))

  // scrolling: keep the title current; when nearing an edge of the drawn weeks, move the window (once it has stopped)
  const idle = useRef(0)
  const onScroll = () => {
    report()
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => {
      const el = box.current
      if (!el) return
      const { pitch: p, origin: o } = live.current
      const row = el.scrollTop / p
      if (row > 6 && row < WEEKS - 14) return
      const f = Math.round(row)
      keep.current = { date: addDays(o, f * 7), offset: el.scrollTop - f * p }
      live.current.onRebase(addDays(o, f * 7))
    }, 140)
  }

  // with a mouse the grid can be dragged like a sheet (a touch scrolls it as it always does); a click that ends a drag is not a click
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null)
  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, a, [data-lift-id]')) return
    drag.current = { y: e.clientY, top: box.current!.scrollTop, moved: false }
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d || !box.current) return
      if (!d.moved && Math.abs(e.clientY - d.y) < 6) return
      d.moved = true
      box.current.style.cursor = 'grabbing'
      box.current.scrollTop = d.top - (e.clientY - d.y)
    }
    const up = () => {
      const d = drag.current
      drag.current = null
      if (box.current) box.current.style.cursor = ''
      if (d?.moved) {
        // swallow the click that follows the release
        const stop = (ev: MouseEvent) => (ev.stopPropagation(), ev.preventDefault())
        window.addEventListener('click', stop, { capture: true, once: true })
        window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.clearTimeout(idle.current)
    }
  }, [])

  const cells = days.filter(show)
  return (
    <div ref={box} onScroll={onScroll} onPointerDown={down} data-month-scroll className="scroll-soft min-h-0 flex-1 cursor-[inherit] select-none overflow-y-auto overscroll-contain">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: rowH, gap: GAP }}>
        {cells.map((d) => {
          const dt = fromISO(d)
          return <Fragment key={d}>{render(d, { alt: dt.getMonth() % 2 === 1, monthLabel: dt.getDate() === 1 ? MONTHS[dt.getMonth()].slice(0, 3) : null })}</Fragment>
        })}
      </div>
    </div>
  )
})
