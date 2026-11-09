import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { colorVars } from '../ui/taskColor'
import { DoneButton, DueChip } from '../ui/shared'
import { Flower } from '../ui/Flower'
import type { SceneCluster, SceneTask } from './SpatialScene'
import type { SpatialContent } from './content'
import { addInGroup, dropOutside, endCarry, reparentGroup, retagTask, showCarry } from './actions'
import { descendantsOf } from '../core/tree'
import { cellH, cellW, ensureLayout, nearestFreeSlot, repose, separate, slotAt, snapCluster, snapFree, tidyClusters, tidyEverything } from './layout'
import { useSpatial } from './store'
import { K, type SpatialLayoutData } from './types'

// layout units to pixels: across (a group is as wide as its columns) and down (rows are tighter than in 3D)
const PX = 11.8
const PY = 5
const ROW = 46
const HEAD = 40
const TASK_W = 220
const MOVE = 6
const SPRING_MS = 700

type Box = { x: number; y: number; w: number; cols: number; h: number; n: number; rows: number }
type Carry = { kind: 'task' | 'group'; id: string; x: number; y: number; dx: number; dy: number; hover: string | null }

/**
 * A task as a flat row: the pond bubble's look (the `.tint` class), and the same parts every other view uses (the done button, the
 * date chip), so it ticks, reads and colours as they do. Dragging it is the canvas's business (the row carries `data-task`).
 */
function FlatRow({ t, extra }: { t: SceneTask; extra?: React.CSSProperties }) {
  const task = useStore((s) => s.tasks.find((x) => x.id === t.id))
  const select = useStore((s) => s.select)
  if (!task) return null
  return (
    <div data-task={t.id} style={{ ...colorVars(t.hue, t.urgency ?? 0.5), ...extra, opacity: t.done ? 0.55 : (extra?.opacity ?? 1) }} className="tint flex cursor-grab items-center gap-2.5 rounded-2xl px-2.5 py-2">
      <DoneButton task={task} size={22} />
      <button type="button" onClick={() => select(t.id)} className={`min-w-0 flex-1 cursor-grab truncate text-left text-sm ${t.done ? 'text-ink-faint line-through' : ''}`}>
        {t.title || 'Untitled'}
      </button>
      <DueChip task={task} compact />
    </div>
  )
}

/**
 * The flat canvas, with no 3D and no sensors: the same groups laid out as the same org chart, on a canvas you drag around and pinch (or
 * scroll) to zoom. Everything the 3D space does works here too: drag a task onto a group (or a folded name) to put it there, or out into
 * the open to leave it floating; drag a group by its name or box to move it, or onto another name to put it inside; hover over a folded
 * name and it opens to show you where things go; tap a name to turn to it, the twirl to fold it.
 */
export function StaticCanvas({ content, layout, fitTick = 0 }: { content: SpatialContent; layout: SpatialLayoutData; fitTick?: number }) {
  const toggleCollapsed = useSpatial((s) => s.toggleCollapsed)
  const tidy = useSpatial((s) => s.tidy)
  const box = useRef<HTMLDivElement>(null)
  const [v, setV] = useState({ x: 0, y: 0, k: 1 })
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ x: number; y: number; vx: number; vy: number; d: number; k: number } | null>(null)
  const [carry, setCarry] = useState<Carry | null>(null)
  const press = useRef<{ pid: number; sx: number; sy: number; kind: 'task' | 'group'; id: string; started: boolean } | null>(null)
  const suppress = useRef(false)
  const sprung = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const live = useRef({ content, v })
  live.current = { content, v }

  // where each group sits (the layout is kept up to date by the view; this fills any gap so nothing is left out)
  const L = useMemo(() => ensureLayout(layout, { clusters: content.clusters.map((c, i) => ({ id: c.id, parent: c.parent ?? null, depth: c.depth, order: i })), tasks: content.tasks.map((t) => ({ id: t.id, cluster: t.cluster })), allTaskIds: new Set(content.tasks.map((t) => t.id)), allClusterIds: new Set(content.clusters.map((c) => c.id)) }), [content, layout])
  const inGrid = useMemo(() => {
    const m = new Map<string, SceneTask[]>()
    for (const t of content.tasks) {
      const tp = L.tasks[t.id]
      if (tp?.free) continue
      m.set(t.cluster, [...(m.get(t.cluster) ?? []), t])
    }
    for (const list of m.values()) list.sort((a, b) => (L.tasks[a.id]?.slot ?? 0) - (L.tasks[b.id]?.slot ?? 0))
    return m
  }, [content, L])
  const places = useMemo(() => {
    const out = new Map<string, Box>()
    for (const c of content.clusters) {
      const p = L.clusters[c.id]
      if (!p) continue
      const n = inGrid.get(c.id)?.length ?? 0
      // as many rows as the cards need (a card tidied into a low slot makes the box taller)
      const rows = Math.max(1, Math.ceil(n / p.cols), ...(inGrid.get(c.id) ?? []).map((t) => Math.floor((L.tasks[t.id]?.slot ?? 0) / p.cols) + 1))
      const w = p.cols * (cellW * PX) - 14
      out.set(c.id, { x: p.a * p.r * PX - w / 2, y: -(p.y + 1.2 * K) * PY, w, cols: p.cols, n, rows, h: HEAD + (n && !c.collapsed ? 24 + rows * ROW + (rows - 1) * 8 : 0) })
    }
    return out
  }, [content, L, inGrid])
  const kidsOf = (id: string): Set<string> => descendantsOf(content.clusters, id)
  const carriedKids = useMemo(() => (carry?.kind === 'group' ? kidsOf(carry.id) : new Set<string>()), [carry?.kind, carry?.id, content]) // eslint-disable-line react-hooks/exhaustive-deps
  const at = (id: string): Box | undefined => {
    const b = places.get(id)
    if (!b) return undefined
    if (carry?.kind !== 'group') return b
    const home = places.get(carry.id)
    if (!home) return b
    // the carried group is under the finger and its subgroups go with it, keeping their places around it
    if (carry.id === id) return { ...b, x: carry.x - carry.dx, y: carry.y - carry.dy }
    if (carriedKids.has(id)) return { ...b, x: b.x + (carry.x - carry.dx - home.x), y: b.y + (carry.y - carry.dy - home.y) }
    return b
  }
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
  /** Turn to a group: it comes to the middle of the canvas, closer. */
  const focus = (id: string) => {
    const b = places.get(id)
    const r = box.current?.getBoundingClientRect()
    if (!b || !r) return
    const k = Math.min(1.6, Math.max(v.k, 1))
    setV({ k, x: r.width / 2 - (b.x + b.w / 2) * k, y: r.height / 3 - b.y * k })
  }
  const canvasPoint = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k }
  }
  /** The group under a point on the canvas: its name (always) or its box (when open). */
  const targetAt = (x: number, y: number, except: string): { id: string; name: boolean } | null => {
    for (const c of content.clusters) {
      if (c.id === except) continue
      const b = places.get(c.id)
      if (!b) continue
      if (x < b.x || x > b.x + Math.max(b.w, 260) || y < b.y || y > b.y + b.h) continue
      return { id: c.id, name: y < b.y + HEAD }
    }
    return null
  }

  // spring-loaded: a folded group opens when something is held over it, and closes again afterwards unless it was dropped into
  const hoverTo = (id: string | null) => {
    setCarry((c) => (c && c.hover !== id ? { ...c, hover: id } : c))
    clearTimeout(timer.current)
    if (id && live.current.content.clusters.find((c) => c.id === id)?.collapsed) {
      timer.current = setTimeout(() => {
        if (live.current.content.clusters.find((c) => c.id === id)?.collapsed) {
          sprung.current.add(id)
          toggleCollapsed(id)
        }
      }, SPRING_MS)
    }
  }
  const closeSprung = (keep: string | null) => {
    clearTimeout(timer.current)
    for (const id of sprung.current) if (id !== keep && !live.current.content.clusters.find((c) => c.id === id)?.collapsed) toggleCollapsed(id)
    sprung.current.clear()
  }

  const writeLayout = (next: SpatialLayoutData) => useSpatial.getState().setLayout(next)
  const dropTask = (c: Carry) => {
    const tp = L.tasks[c.id]
    if (!tp) return
    const over = targetAt(c.x, c.y, '')
    const own = content.tasks.find((t) => t.id === c.id)?.cluster
    if (over) {
      const cl = L.clusters[over.id]
      const used = new Set(Object.values(L.tasks).filter((t) => t.c === over.id && !t.free && t !== tp).map((t) => t.slot))
      let slot = 0
      if (over.id === own && !tp.free && !tidy) slot = tp.slot
      else while (used.has(slot)) slot++
      let { u, v: vv } = slotAt(slot, cl.cols)
      const bx = places.get(over.id)
      if (tidy && !over.name && bx) {
        // keep tidy: the nearest free slot to where it was let go in the box
        const cw = (bx.w - 24 - (cl.cols - 1) * 8) / cl.cols
        const col = (c.x - bx.x - 12) / (cw + 8) - 0.5
        const row = (c.y - bx.y - HEAD - 12) / (ROW + 8) - 0.5
        ;({ slot, u, v: vv } = nearestFreeSlot(used, cl.cols, (col - (cl.cols - 1) / 2) * cellW, -(row + 1) * cellH))
      }
      writeLayout({ ...L, tasks: { ...L.tasks, [c.id]: { ...tp, c: over.id, u, v: vv, dz: 0, slot, free: undefined } } })
      if (over.id !== own) retagTask(c.id, over.id)
    } else {
      const free = { a: c.x / PX / r0, y: -c.y / PY }
      writeLayout({ ...L, tasks: { ...L.tasks, [c.id]: { ...tp, free: tidy ? snapFree(free) : free } } })
    }
    closeSprung(over?.id ?? null)
  }
  const dropGroup = (c: Carry) => {
    const p = L.clusters[c.id]
    const b = places.get(c.id)
    if (!p || !b) return
    const over = c.hover && c.hover !== c.id ? c.hover : null
    if (over) {
      reparentGroup(c.id, over)
    } else {
      const left = c.x - c.dx
      const top = c.y - c.dy
      const moved = repose(p, (left + b.w / 2) / (PX * p.r), -(top / PY) - 1.2 * K)
      const next = { ...L.clusters, [c.id]: moved }
      for (const k of kidsOf(c.id)) next[k] = repose(L.clusters[k], L.clusters[k].a + (moved.a - p.a), L.clusters[k].y + (moved.y - p.y))
      if (tidy) {
        // keep tidy: the group snaps to the grid (its subgroups keeping their places around it), and the others make room
        const p1 = snapCluster(moved)
        for (const k of kidsOf(c.id)) next[k] = repose(next[k], next[k].a + (p1.a - moved.a), next[k].y + (p1.y - moved.y))
        next[c.id] = p1
        writeLayout({ ...L, clusters: tidyClusters(next, new Set([c.id, ...kidsOf(c.id)])) })
      } else writeLayout({ ...L, clusters: separate(next, new Set([c.id, ...kidsOf(c.id)])) })
    }
    closeSprung(over)
  }

  // turning "keep tidy" on tidies what is already there (it glides into place)
  const wasTidy = useRef(tidy)
  useEffect(() => {
    if (tidy && !wasTidy.current) writeLayout(tidyEverything(L))
    wasTidy.current = tidy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tidy])

  const links = content.clusters.filter((c) => c.parent && places.has(c.parent) && places.has(c.id))
  const free = content.tasks.filter((t) => L.tasks[t.id]?.free)
  const r0 = L.clusters[Object.keys(L.clusters)[0]]?.r ?? 80

  const row = (t: SceneTask, extra?: React.CSSProperties) => <FlatRow key={t.id} t={t} extra={extra} />

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-none select-none overflow-hidden rounded-[inherit] bg-gradient-to-b from-lilac-100/60 to-white/30"
      onClickCapture={(e) => {
        if (suppress.current) {
          suppress.current = false
          e.stopPropagation()
          e.preventDefault()
        }
      }}
      onPointerDown={(e) => {
        suppress.current = false
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const [a, b] = [...pts.current.values()]
        if (b) {
          // a second finger: it is a pinch, and whatever was being carried is let go where it was
          press.current = null
          setCarry(null)
          closeSprung(null)
          e.currentTarget.setPointerCapture(e.pointerId)
          gesture.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, d: Math.hypot(a.x - b.x, a.y - b.y), k: v.k }
          return
        }
        const el = e.target as HTMLElement
        const taskEl = el.closest('[data-task]') as HTMLElement | null
        const hubEl = el.closest('[data-hub]') as HTMLElement | null
        const boxEl = el.closest('[data-box]') as HTMLElement | null
        if (taskEl || hubEl || boxEl) {
          const id = taskEl?.dataset.task ?? hubEl?.dataset.hub ?? boxEl?.dataset.box ?? ''
          press.current = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, kind: taskEl ? 'task' : 'group', id, started: false }
          return
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        gesture.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, d: 0, k: v.k }
      }}
      onPointerMove={(e) => {
        if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const pr = press.current
        if (pr && pr.pid === e.pointerId) {
          if (!pr.started && Math.hypot(e.clientX - pr.sx, e.clientY - pr.sy) > MOVE) {
            pr.started = true
            suppress.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            const p0 = canvasPoint({ clientX: pr.sx, clientY: pr.sy })
            const src = pr.kind === 'task' ? (L.tasks[pr.id]?.free ? { x: L.tasks[pr.id].free!.a * PX * r0 - TASK_W / 2, y: -L.tasks[pr.id].free!.y * PY - 20 } : (() => { const el = box.current!.querySelector(`[data-task="${CSS.escape(pr.id)}"]`) as HTMLElement | null; const q = el?.getBoundingClientRect(); const r = box.current!.getBoundingClientRect(); return q ? { x: (q.left - r.left - v.x) / v.k, y: (q.top - r.top - v.y) / v.k } : { x: p0.x - 80, y: p0.y - 16 } })()) : { x: places.get(pr.id)?.x ?? p0.x, y: places.get(pr.id)?.y ?? p0.y }
            setCarry({ kind: pr.kind, id: pr.id, x: p0.x, y: p0.y, dx: p0.x - src.x, dy: p0.y - src.y, hover: null })
          }
          if (pr.started) {
            const p = canvasPoint(e)
            const ex = pr.kind === 'group' ? pr.id : ''
            const o = targetAt(p.x, p.y, ex)
            if (o && pr.kind === 'group' && kidsOf(pr.id).has(o.id)) return setCarry((c) => (c ? { ...c, x: p.x, y: p.y, hover: null } : c))
            // a task can join a group by its name or its box; a group only goes inside another by its name
            const h = o && (pr.kind === 'task' || o.name) ? o.id : null
            setCarry((c) => (c ? { ...c, x: p.x, y: p.y } : c))
            showCarry(pr.kind, pr.id, pr.kind === 'task' ? (content.tasks.find((t) => t.id === pr.id)?.title ?? 'Task') : (content.clusters.find((c) => c.id === pr.id)?.name ?? 'Group'), e.clientX, e.clientY)
            if (h !== carry?.hover) hoverTo(h)
          }
          return
        }
        if (!gesture.current) return
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
        const pr = press.current
        if (pr && pr.pid === e.pointerId) {
          press.current = null
          if (pr.started && carry) {
            endCarry()
            if (dropOutside(pr.kind, pr.id, e.clientX, e.clientY)) {
              closeSprung(null)
              setCarry(null)
              return
            }
            if (pr.kind === 'task') dropTask(carry)
            else dropGroup(carry)
            setCarry(null)
            return
          }
          // a tap on a group's name turns to it (the twirl and the buttons have their own taps)
          const el = e.target as HTMLElement
          if (pr.kind === 'group' && el.closest('[data-hub]') && !el.closest('button')) focus(pr.id)
          // blank space inside a group's box: a new item there, tagged with the group
          else if (pr.kind === 'group' && el.closest('[data-box]') && !el.closest('[data-task]') && !el.closest('button')) addInGroup(pr.id)
          return
        }
        gesture.current = pts.current.size === 1 ? { x: [...pts.current.values()][0].x, y: [...pts.current.values()][0].y, vx: v.x, vy: v.y, d: 0, k: v.k } : null
      }}
      onPointerCancel={(e) => {
        pts.current.delete(e.pointerId)
        gesture.current = null
        if (press.current?.pid === e.pointerId) {
          press.current = null
          endCarry()
          setCarry(null)
          closeSprung(null)
        }
      }}
      onWheel={(e) => {
        const r = box.current!.getBoundingClientRect()
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
      }}
      aria-label="Your tasks by group. Drag to move around, pinch to zoom; drag a task or a group to move it."
    >
      <div className="absolute left-0 top-0" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})`, transformOrigin: '0 0' }}>
        <svg className="pointer-events-none absolute overflow-visible" width={1} height={1} aria-hidden>
          {links.map((c) => {
            const a = at(c.parent as string)!
            const b = at(c.id)!
            const x0 = a.x + a.w / 2
            const x1 = b.x + b.w / 2
            const y1 = b.y
            const y0 = Math.min(a.y + a.h, y1 - 24) // (always downhill: never ends above where it starts)
            const m = (y0 + y1) / 2
            return <path key={c.id} d={`M${x0},${y0} C${x0},${m} ${x1},${m} ${x1},${y1}`} fill="none" stroke={`hsl(${Math.max(0, c.hue)},50%,62%)`} strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
          })}
        </svg>
        {content.clusters.map((c: SceneCluster) => {
          const p = at(c.id)
          if (!p) return null
          const grid = inGrid.get(c.id) ?? []
          const lit = carry?.hover === c.id
          const dragging = carry?.kind === 'group' && carry.id === c.id
          return (
            <section key={c.id} className="absolute" style={{ left: p.x, top: p.y, width: p.w, zIndex: dragging ? 5 : 1, opacity: dragging ? 0.92 : 1, transition: carry?.kind === 'group' ? 'none' : 'left 0.38s cubic-bezier(0.3,1.1,0.5,1), top 0.38s cubic-bezier(0.3,1.1,0.5,1)' }} aria-label={c.name}>
              <h3
                data-hub={c.id}
                className={`mb-2 flex cursor-grab items-center gap-1.5 rounded-full px-1 font-display text-2xl font-bold italic transition-colors ${lit ? 'bg-white/80 ring-2 ring-white' : ''}`}
                style={{ color: `hsl(${Math.max(0, c.hue)},50%,36%)`, textShadow: '0 0 8px rgba(255,255,255,0.95)' }}
              >
                <button type="button" aria-expanded={!c.collapsed} aria-label={`${c.collapsed ? 'Show' : 'Fold'} ${c.name}`} onClick={() => toggleCollapsed(c.id)} className="grid h-6 w-5 shrink-0 place-items-center text-[0.7rem] not-italic opacity-75">
                  {c.collapsed ? '▸' : '▾'}
                </button>
                <Flower hue={c.hue} shape={c.shape} size={22} />
                {c.name}
                <span className="rounded-full px-2 text-xs not-italic" style={{ background: `hsl(${Math.max(0, c.hue)},60%,90%)` }}>
                  {c.count}
                </span>
              </h3>
              <div
                data-box={c.id}
                className={`relative rounded-[2rem] border transition-shadow ${c.collapsed || grid.length === 0 ? 'hidden' : ''}`}
                style={{ height: 24 + p.rows * ROW + (p.rows - 1) * 8, background: `hsl(${Math.max(0, c.hue)},60%,${lit ? 78 : 84}%,${lit ? 0.6 : 0.3})`, borderColor: `hsl(${Math.max(0, c.hue)},55%,${lit ? 58 : 72}%,${lit ? 0.95 : 0.5})`, borderWidth: lit ? 3 : 1 }}
              >
                {grid.map((t) => {
                  // each card sits in its slot of the group's grid, and glides there when the slot changes
                  const slot = L.tasks[t.id]?.slot ?? 0
                  const cw = (p.w - 24 - (p.cols - 1) * 8) / p.cols
                  const ghost = carry?.kind === 'task' && carry.id === t.id
                  return (
                    <div key={t.id} className="absolute" style={{ left: 12 + (slot % p.cols) * (cw + 8), top: 12 + Math.floor(slot / p.cols) * (ROW + 8), width: cw, transition: carry ? 'none' : 'left 0.32s cubic-bezier(0.3,1.1,0.5,1), top 0.32s cubic-bezier(0.3,1.1,0.5,1)' }}>
                      {row(t, ghost ? { opacity: 0.3 } : undefined)}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
        {free.map((t) => {
          const f = L.tasks[t.id].free!
          if (carry?.kind === 'task' && carry.id === t.id) return null
          return (
            <div key={t.id} className="absolute" style={{ left: f.a * PX * r0 - TASK_W / 2, top: -f.y * PY - 20, width: TASK_W, zIndex: 3, transition: carry ? 'none' : 'left 0.32s cubic-bezier(0.3,1.1,0.5,1), top 0.32s cubic-bezier(0.3,1.1,0.5,1)' }}>
              {row(t)}
            </div>
          )
        })}
        {carry?.kind === 'task' &&
          (() => {
            const t = content.tasks.find((x) => x.id === carry.id)
            return t ? (
              <div className="pointer-events-none absolute" style={{ left: carry.x - carry.dx, top: carry.y - carry.dy, width: TASK_W, zIndex: 9, transform: 'scale(1.05) rotate(-1.5deg)', filter: 'drop-shadow(0 8px 10px rgba(80,50,130,0.3))' }}>
                {row(t, { cursor: 'grabbing' })}
              </div>
            ) : null
          })()}
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
