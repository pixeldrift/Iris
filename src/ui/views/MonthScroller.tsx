import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, diffDays, fromISO, MONTHS, startOfWeek, toISO } from '../../core/dates'
import { useDnd, targetAt } from '../dnd'

const WEEKS = 60
const BEFORE = 20
const GAP = 6
/** the space between week rows: enough that the name of a month fits above its first day */
const ROW_GAP = 20
/** how far the top fade reaches */
const FADE = 24
/** the space a month's name takes above its first day, when the rows are kept tight */
const LABEL_SPACE = 14
/** the divider between months stops this far short of each end of the boxes (a touch under full height looks full height) */
const INSET = 3
/** how far above its box the month's name begins (the divider rises that far) */
const LABEL_TOP = 15

export interface MonthHandle {
  /** Slide so the week the month starts in is at the top. */
  goTo: (date: string, smooth?: boolean) => void
}

export interface MonthView {
  /** "Sep 2026", or "Sep–Oct 2026" while two months are on screen */
  title: string
  /** the same with the month spelled out ("September 2026"); a split stays short */
  full: string
  /** the shortest: the year as an apostrophe and two digits ("Dec ’29 – Jan ’30") */
  tiny: string
  /** the first of the month that has most of the screen */
  month: string
  /** The grid is being looked at by hand (dragged or scrolled). Only then is the title allowed to name two months; after the arrows it names one. */
  manual: boolean
}

/**
 * The month as an endless grid of weeks: drag it (or scroll it) to look further down or back; the title says which months are
 * showing. A window of weeks around `base` is drawn, and it moves along when the edge is neared.
 */
export const MonthScroller = forwardRef<MonthHandle, { base: string; cols: number; /** room between week rows for the month's name above its first day (otherwise the rows sit close) */ labelGap: boolean; /** keep the rows tight; only the week a month starts in has room for the name (a preview) */ tightRows?: boolean; show: (d: string) => boolean; render: (d: string, info: { alt: boolean; monthLabel: string | null }) => React.ReactNode; onView: (v: MonthView) => void; onRebase: (d: string) => void }>(function MonthScroller(
  { base, cols, labelGap, tightRows = false, show, render, onView, onRebase },
  ref,
) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 500 })
  const origin = useMemo(() => startOfWeek(addDays(base, -BEFORE * 7)), [base])
  const days = useMemo(() => Array.from({ length: WEEKS * 7 }, (_, i) => addDays(origin, i)), [origin])
  const colW = (size.w - GAP * (cols - 1)) / cols
  // five rows fit the box on a wide screen; on a phone the days are kept squarish rather than long and thin
  const tight = labelGap && tightRows
  const rowGap = labelGap && !tight ? ROW_GAP : GAP
  // where the first week of a month sits below the top: clear of the fade (and, upright, with room for the name above it)
  const off = FADE + (labelGap ? 16 : 4)
  const rowH = Math.max(62, Math.min(Math.floor((size.h - off - (tight ? LABEL_SPACE : 0) - rowGap * 4) / 5), Math.round(colW * 1.38)))
  const pitch = rowH + rowGap
  const weekOf = useCallback((d: string) => Math.round(diffDays(origin, startOfWeek(d)) / 7), [origin])
  // after the arrows (or Today) slide the grid, its title names one month; the first touch by hand frees it to name two
  const programmatic = useRef(false)
  const cells = useMemo(() => days.filter(show), [days, show]) // eslint-disable-line react-hooks/exhaustive-deps
  // where each week row starts (all the same distance apart, except that a week a month starts in is taller when the rows are tight)
  const rowInfo = useMemo(() => {
    const n = Math.ceil(cells.length / cols)
    const tops: number[] = []
    const extra: boolean[] = []
    let y = 0
    for (let r = 0; r < n; r++) {
      const changes = tight && cells.slice(r * cols, (r + 1) * cols).some((d) => fromISO(d).getDate() === 1)
      tops.push(y)
      extra.push(changes)
      y += rowH + (changes ? LABEL_SPACE : 0) + rowGap
    }
    tops.push(y)
    return { tops, extra }
  }, [cells, cols, rowH, rowGap, tight])
  const nearest = (tops: number[], y: number) => {
    let best = 0
    for (let i = 1; i < tops.length - 1; i++) if (Math.abs(tops[i] - y) < Math.abs(tops[best] - y)) best = i
    return best
  }
  const live = useRef({ tops: rowInfo.tops, nearest, off, weekOf, onView, onRebase, origin })
  live.current = { tops: rowInfo.tops, nearest, off, weekOf, onView, onRebase, origin }

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
    const { tops, nearest: near, off: o2, origin: o } = live.current
    const first = near(tops, el.scrollTop + o2)
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
    const manual = !programmatic.current
    const majorKey = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const list = manual && months.length ? months : [...count.entries()].filter(([k]) => k === majorKey)
    const parts = list.map(([k]) => k.split('-').map(Number) as [number, number])
    const major = majorKey.split('-').map(Number)
    const y0 = parts[0][0]
    const y1 = parts[parts.length - 1][0]
    const name = (m: number) => MONTHS[m].slice(0, 3)
    const title = parts.length === 1 ? `${name(parts[0][1])} ${y0}` : `${name(parts[0][1])}${y0 !== y1 ? ` ${y0}` : ''}–${name(parts[parts.length - 1][1])} ${y1}`
    const full = parts.length === 1 ? `${MONTHS[parts[0][1]]} ${y0}` : title
    const yy = (y: number) => `’${String(y % 100).padStart(2, '0')}`
    const tiny = parts.length === 1 ? `${name(parts[0][1])} ${yy(y0)}` : y0 !== y1 ? `${name(parts[0][1])} ${yy(y0)} – ${name(parts[parts.length - 1][1])} ${yy(y1)}` : `${name(parts[0][1])} – ${name(parts[parts.length - 1][1])} ${yy(y1)}`
    live.current.onView({ title, full, tiny, month: toISO(new Date(major[0], major[1], 1)), manual })
    // the top edge fades out instead of cutting rows off (the bottom has the undated items under a line)
    el.toggleAttribute('data-top', el.scrollTop > 6)
  }, [])

  // where to put the scroll when the window of weeks changes (kept the same place, or the starting month)
  const keep = useRef<{ date: string; offset: number } | null>(null)
  const started = useRef(false)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    if (keep.current) {
      el.scrollTop = live.current.tops[weekOf(keep.current.date)] + keep.current.offset
      keep.current = null
    } else if (!started.current) {
      el.scrollTop = live.current.tops[weekOf(startOfWeek(base))] - off
    }
    started.current = true
    report()
  }, [origin, pitch, tight]) // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    goTo: (date, smooth = true) => {
      const el = box.current
      if (!el) return
      programmatic.current = true
      const first = toISO(new Date(fromISO(date).getFullYear(), fromISO(date).getMonth(), 1))
      const i = weekOf(first)
      if (i < 3 || i > WEEKS - 10) return void live.current.onRebase(first) // too far from what is drawn: draw around it instead
      el.scrollTo({ top: live.current.tops[i] - live.current.off, behavior: smooth ? 'smooth' : 'auto' })
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
      const { tops, nearest: near, off: o2, origin: o } = live.current
      const f = near(tops, el.scrollTop + o2)
      if (f > 6 && f < WEEKS - 14) return
      keep.current = { date: addDays(o, f * 7), offset: el.scrollTop - tops[f] }
      live.current.onRebase(addDays(o, f * 7))
    }, 140)
  }

  // with a mouse the grid can be dragged like a sheet (a touch scrolls it as it always does); a click that ends a drag is not a click
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null)
  const down = (e: React.PointerEvent) => {
    programmatic.current = false
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

  // an item being dragged that is pulled up past the top of the days (or down past the bottom) carries the grid along with it
  useEffect(() => {
    let raf = 0
    let entered = false
    const tick = () => {
      const el = box.current
      const d = useDnd.getState().drag
      if (!d) entered = false
      else if (el && d.payload.type === 'task') {
        const r = el.getBoundingClientRect()
        const edge = 56
        // an item picked up from below the grid (an undated one) does not scroll it until it has been over the days
        if (d.y > r.top && d.y < r.bottom) entered = true
        let v = 0
        if (entered) {
          if (d.y < r.top + edge) v = -Math.min(1.6, (r.top + edge - d.y) / edge)
          else if (d.y > r.bottom - edge) v = Math.min(1.6, (d.y - (r.bottom - edge)) / edge)
        }
        if (v) {
          el.scrollTop += v * 12
          useDnd.setState({ over: targetAt(d.x, d.y) }) // (what is under the pointer changes as the days slide past)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // a solid violet line down the gap between a month's last day and the next month's first (on the week the month changes)
  const divider = useMemo(() => {
    const key = cells.map((d) => {
      const dt = fromISO(d)
      return dt.getFullYear() * 12 + dt.getMonth()
    })
    let path = ''
    for (let i = 1; i < cells.length; i++) {
      if (i % cols === 0 || key[i - 1] === key[i]) continue
      // centred in the gap, on a whole device pixel (a half CSS pixel on a retina screen) so it is a crisp 1px line with even space either side
      const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
      const wd = Math.max(1, Math.round(dpr))
      const x = (Math.round(((i % cols) * (colW + GAP) - GAP / 2) * dpr - wd / 2) + wd / 2) / dpr
      // from the top of the month's name (or just inside the boxes) to just short of the bottom of the new month's box
      const r = Math.floor(i / cols)
      const top = rowInfo.tops[r] + (labelGap && !tight ? -LABEL_TOP : tight ? 0 : INSET)
      path += `M${x} ${top}V${rowInfo.tops[r] + rowH + (tight ? LABEL_SPACE : 0) - INSET}`
    }
    return path
  }, [cells, cols, colW, rowInfo, rowH, labelGap, tight])
  const rows = Math.ceil(cells.length / cols)
  return (
    <div ref={box} onScroll={onScroll} onPointerDown={down} onWheel={() => (programmatic.current = false)} onTouchStart={() => (programmatic.current = false)} data-month-scroll style={{ ['--fade-t' as string]: `${FADE}px` }} className="scroll-soft fade-mask min-h-0 flex-1 cursor-[inherit] select-none overflow-y-auto overscroll-contain">
      <div className="relative">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: tight ? rowInfo.tops.slice(0, -1).map((_, r) => `${rowH + (rowInfo.extra[r] ? LABEL_SPACE : 0)}px`).join(' ') : undefined, gridAutoRows: tight ? undefined : rowH, columnGap: GAP, rowGap }}>
        {cells.map((d, i) => {
          const dt = fromISO(d)
          const node = render(d, { alt: dt.getMonth() % 2 === 1, monthLabel: dt.getDate() === 1 ? MONTHS[dt.getMonth()].slice(0, 3) : null })
          if (!tight) return <Fragment key={d}>{node}</Fragment>
          // a week a month starts in is taller: the old month's days stay at its top, the new month's sit lower, under the name
          const r = Math.floor(i / cols)
          const newMonth = rowInfo.extra[r] && cells.slice(r * cols, i + 1).some((x) => fromISO(x).getDate() === 1)
          return (
            <div key={d} className="min-w-0 [&>*]:h-full" style={{ alignSelf: rowInfo.extra[r] ? (newMonth ? 'end' : 'start') : 'stretch', height: rowInfo.extra[r] ? rowH : undefined }}>
              {node}
            </div>
          )
        })}
      </div>
      <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={size.w} height={rowInfo.tops[rows]}>
        <path d={divider} fill="none" strokeWidth={1} strokeLinecap="round" className="stroke-lilac-500" />
      </svg>
      </div>
    </div>
  )
})
