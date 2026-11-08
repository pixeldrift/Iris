import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { checkVars } from '../ui/taskColor'
import type { SpatialContent } from './content'
import { cellW, ensureLayout } from './layout'
import { K, type SpatialLayoutData } from './types'

// layout units to pixels: across (a group is as wide as its columns) and down (rows are tighter than in 3D)
const PX = 11.8
const PY = 5
const ROW = 46
const HEAD = 40

/**
 * The flat canvas, with no 3D and no sensors: the same groups laid out as the same org chart, on a canvas you drag around and pinch (or
 * scroll) to zoom. Selecting, opening and completing all work. It is also where the workspace lands when 3D is unavailable.
 */
export function StaticCanvas({ content, layout, fitTick = 0 }: { content: SpatialContent; layout: SpatialLayoutData; fitTick?: number }) {
  const select = useStore((s) => s.select)
  const toggle = useStore((s) => s.toggleDone)
  const box = useRef<HTMLDivElement>(null)
  const [v, setV] = useState({ x: 0, y: 0, k: 1 })
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ x: number; y: number; vx: number; vy: number; d: number; k: number } | null>(null)

  // where each group sits (the layout is kept up to date by the view; this fills any gap so nothing is left out)
  const places = useMemo(() => {
    const L = ensureLayout(layout, { clusters: content.clusters.map((c, i) => ({ id: c.id, parent: c.parent ?? null, depth: c.depth, order: i })), tasks: content.tasks.map((t) => ({ id: t.id, cluster: t.cluster })), allTaskIds: new Set(content.tasks.map((t) => t.id)), allClusterIds: new Set(content.clusters.map((c) => c.id)) })
    const out = new Map<string, { x: number; y: number; w: number; cols: number; h: number }>()
    for (const c of content.clusters) {
      const p = L.clusters[c.id]
      if (!p) continue
      const n = content.tasks.filter((t) => t.cluster === c.id).length
      const cols = p.cols
      const rows = Math.max(1, Math.ceil(n / cols))
      const w = cols * (cellW * PX) - 14
      out.set(c.id, { x: p.a * p.r * PX - w / 2, y: -(p.y + 1.2 * K) * PY, w, cols, h: HEAD + rows * ROW })
    }
    return out
  }, [content, layout])
  const bounds = useMemo(() => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of places.values()) {
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x + p.w)
      y1 = Math.max(y1, p.y + p.h)
    }
    return places.size ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 300, y1: 200 }
  }, [places])

  const fit = () => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const pad = 48
    const k = Math.min(1.4, Math.max(0.2, Math.min((r.width - pad * 2) / (bounds.x1 - bounds.x0), (r.height - pad * 2) / (bounds.y1 - bounds.y0))))
    setV({ k, x: (r.width - (bounds.x1 - bounds.x0) * k) / 2 - bounds.x0 * k, y: (r.height - (bounds.y1 - bounds.y0) * k) / 2 - bounds.y0 * k })
  }
  useEffect(() => {
    if (fitTick) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTick])
  const fitted = useRef(false)
  useLayoutEffect(() => {
    if (fitted.current || !places.size) return
    fitted.current = true
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places])
  useEffect(() => {
    const el = box.current
    if (!el) return
    // the browser's own pinch and scroll are ours here
    const stop = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  const zoomAt = (f: number, cx: number, cy: number) =>
    setV((s) => {
      const k = Math.min(3, Math.max(0.15, s.k * f))
      const r = k / s.k
      return { k, x: cx - (cx - s.x) * r, y: cy - (cy - s.y) * r }
    })
  const centre = () => {
    const r = box.current?.getBoundingClientRect()
    return { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 }
  }
  const links = content.clusters.filter((c) => c.parent && places.has(c.parent) && places.has(c.id))

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-none select-none overflow-hidden rounded-[inherit] bg-gradient-to-b from-lilac-100/60 to-white/30"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        e.currentTarget.setPointerCapture(e.pointerId)
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const [a, b] = [...pts.current.values()]
        gesture.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, d: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, k: v.k }
      }}
      onPointerMove={(e) => {
        if (!pts.current.has(e.pointerId) || !gesture.current) return
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const g = gesture.current
        const [a, b] = [...pts.current.values()]
        if (b && g.d > 0) {
          const r = box.current!.getBoundingClientRect()
          const f = Math.hypot(a.x - b.x, a.y - b.y) / g.d
          const k = Math.min(3, Math.max(0.15, g.k * f))
          const mx = (a.x + b.x) / 2 - r.left
          const my = (a.y + b.y) / 2 - r.top
          setV((s) => ({ k, x: mx - ((mx - s.x) * k) / s.k, y: my - ((my - s.y) * k) / s.k }))
          g.d = Math.hypot(a.x - b.x, a.y - b.y)
          g.k = k
        } else if (!b) setV((s) => ({ ...s, x: g.vx + e.clientX - g.x, y: g.vy + e.clientY - g.y }))
      }}
      onPointerUp={(e) => {
        pts.current.delete(e.pointerId)
        gesture.current = pts.current.size === 1 ? { x: [...pts.current.values()][0].x, y: [...pts.current.values()][0].y, vx: v.x, vy: v.y, d: 0, k: v.k } : null
      }}
      onPointerCancel={(e) => {
        pts.current.delete(e.pointerId)
        gesture.current = null
      }}
      onWheel={(e) => {
        const r = box.current!.getBoundingClientRect()
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
      }}
      aria-label="Your tasks by group. Drag to move around, pinch to zoom."
    >
      <div className="absolute left-0 top-0" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})`, transformOrigin: '0 0' }}>
        <svg className="pointer-events-none absolute overflow-visible" width={1} height={1} aria-hidden>
          {links.map((c) => {
            const a = places.get(c.parent as string)!
            const b = places.get(c.id)!
            const x0 = a.x + a.w / 2
            const y0 = a.y + a.h
            const x1 = b.x + b.w / 2
            const y1 = b.y
            const m = (y0 + y1) / 2
            return <path key={c.id} d={`M${x0},${y0} C${x0},${m} ${x1},${m} ${x1},${y1}`} fill="none" stroke={`hsl(${Math.max(0, c.hue)},50%,62%)`} strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
          })}
        </svg>
        {content.clusters.map((c) => {
          const p = places.get(c.id)
          if (!p) return null
          return (
            <section key={c.id} className="absolute" style={{ left: p.x, top: p.y, width: p.w }} aria-label={c.name}>
              <div className="absolute -inset-3 -z-10 rounded-[2rem] border" style={{ background: `hsl(${Math.max(0, c.hue)},60%,84%,0.3)`, borderColor: `hsl(${Math.max(0, c.hue)},55%,72%,0.5)` }} aria-hidden />
              <h3 className="mb-2 flex items-center gap-2 px-1 font-display text-2xl font-bold italic" style={{ color: `hsl(${Math.max(0, c.hue)},50%,36%)`, textShadow: '0 0 8px rgba(255,255,255,0.95)' }}>
                {c.name}
                <span className="rounded-full px-2 text-xs not-italic" style={{ background: `hsl(${Math.max(0, c.hue)},60%,90%)` }}>
                  {c.count}
                </span>
              </h3>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${p.cols}, minmax(0, 1fr))` }}>
                {content.tasks
                  .filter((t) => t.cluster === c.id)
                  .map((t) => {
                    const vars = { ['--h' as string]: Math.max(0, t.hue), ['--s' as string]: t.hue < 0 ? 0 : 1, ['--u' as string]: 0.5, ...checkVars(t.hue) } as React.CSSProperties
                    return (
                      // the line view's row: its tint and outline, an inset check, the title on one line (cut with an ellipsis), the date that never wraps
                      <div key={t.id} style={{ ...vars, opacity: t.done ? 0.55 : 1 }} className="tint flex items-center gap-2.5 rounded-xl px-2.5 py-2">
                        <button type="button" role="checkbox" aria-checked={t.done} aria-label={`${t.done ? 'Mark not done' : 'Mark done'}: ${t.title}`} onClick={() => toggle(t.id)} className={`well-circle grid h-[1.35rem] w-[1.35rem] shrink-0 place-items-center rounded-full text-xs text-white ${t.done ? 'is-on' : ''}`}>
                          {t.done ? '✓' : ''}
                        </button>
                        <button type="button" onClick={() => select(t.id)} className={`min-w-0 flex-1 truncate text-left text-sm ${t.done ? 'text-ink-faint line-through' : ''}`}>
                          {t.title || 'Untitled'}
                        </button>
                        {t.due && (
                          <span className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem]" style={{ background: `hsl(${Math.max(0, t.hue)},60%,88%)`, color: `hsl(${Math.max(0, t.hue)},40%,30%)` }}>
                            {t.due}
                          </span>
                        )}
                      </div>
                    )
                  })}
              </div>
            </section>
          )
        })}
        {content.tasks.length === 0 && <p className="p-6 text-sm text-ink-faint">Nothing to show here yet.</p>}
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.2, centre().x, centre().y)} className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-lg shadow">
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.2, centre().x, centre().y)} className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-lg shadow">
          −
        </button>
      </div>
    </div>
  )
}
