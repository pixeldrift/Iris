import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ZoomControl } from '../ui/ZoomControl'
import { useStore } from '../state/store'
import { popupWasOpen } from '../ui/popupGuard'
import { colorVars, useExtraHues } from '../ui/taskColor'
import { dueInfo } from '../core/rowModel'
import { DoneButton, DueChip, GroupDots, ItemProgress, TallyIncrement } from '../ui/shared'
import { hasProgress, progressOf } from '../core/progress'
import { isDoneNow } from '../core/recurrence'
import { Flower } from '../ui/Flower'
import type { SceneCluster, SceneTask } from './SpatialScene'
import type { SpatialContent } from './content'
import { addInGroup, addLoose, dropOutside, endCarry, reparentGroup, retagTask, showCarry } from './actions'
import { descendantsOf } from '../core/tree'
import { createPortal } from 'react-dom'
import { edgeDots } from '../core/edges'
import { LOOSE, MAX_COLS, MAX_ROWS, cellH, cellW, detent, ensureLayout, minSizeOf, nearestFreeSlot, repose, resizeCluster, separate, settled, slotAt, snapCluster, snapFree, springStep, tidyClusters, tidyEverything, type Edge, type Spring } from './layout'
import { useSpatial } from './store'
import { K, type SpatialLayoutData } from './types'

// layout units to pixels: across (a group is as wide as its columns) and down (rows are tighter than in 3D)
const PX = 11.8
const PY = 5.9 // (with the taller cards: the same room between groups as before)
const ROW = 56
const HEAD = 40
// a group's box, in canvas pixels: the cards sit in columns CELL apart with GAP between them, and the box has the same room round them as in 3D
// (a good margin at the sides, less above and a little more below), so the corner dots are clear of the cards
const CELL = Math.round(cellW * PX)
const GAP = 8
const CARD_W = CELL - GAP
const PADX = 40
const PAD_TOP = 14
const PAD_BOTTOM = 24
const boxW = (cols: number) => cols * CELL - GAP + 2 * PADX
const boxH = (rows: number) => PAD_TOP + PAD_BOTTOM + rows * ROW + (rows - 1) * GAP
const TASK_W = CARD_W // (a loose card is the width of one in a group, and its grid has the same gap)
const MOVE = 6
const SPRING_MS = 700

type Box = { x: number; y: number; w: number; cols: number; h: number; n: number; rows: number }
type Carry = { kind: 'task' | 'group'; id: string; x: number; y: number; dx: number; dy: number; hover: string | null }

/**
 * A task as a flat row: the pond bubble's look (the `.tint` class), and the same parts every other view uses (the done button, the
 * date chip), so it ticks, reads and colours as they do. Dragging it is the canvas's business (the row carries `data-task`).
 */
function FlatRow({ t, extra }: { t: SceneTask; extra?: React.CSSProperties }) {
  const task = useStore((s) => s.tasks.find((x) => x.id === t.taskId))
  const lit = useStore((s) => s.selectedId === t.taskId)
  const select = useStore((s) => s.select)
  const extras = useExtraHues(task ?? { folderIds: [] })
  if (!task) return null
  // every card is the same height. The check and the title are pinned at the top; the chips (a date, a +1) sit at the bottom, and a card with
  // none lets the title wrap onto the room that is left
  const chips = !!dueInfo(task) || !!task.tally || extras.length > 0
  const bar = hasProgress(task.kind) && !isDoneNow(task) && progressOf(task) > 0
  return (
    <div data-task={t.id} style={{ ...colorVars(t.hue, t.urgency ?? 0.5, extras), ...(task.image ? { ['--photo' as string]: `url("${task.image}")` } : {}), ...extra, height: ROW, opacity: t.done ? 0.55 : (extra?.opacity ?? 1) }} className={`tint ${task.image ? `pad-photo ${task.imageTint === false ? 'untinted' : ''}` : 'tint-flat'} relative flex cursor-grab items-start gap-2.5 rounded-2xl px-2.5 pb-2.5 pt-1.5 ${lit ? 'ring-2 ring-lilac-500 ring-offset-1' : ''}`}>
      <DoneButton task={task} size={22} />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <button type="button" onClick={() => select(t.taskId)} aria-label={t.title || 'Untitled'} className={`block min-h-5 w-full cursor-grab text-left text-sm leading-5 ${chips ? 'truncate' : 'line-clamp-2'} ${t.done ? 'text-ink-faint line-through' : ''}`}>
          {t.title || (task.image ? '' : 'Untitled')}
        </button>
        {(chips || extras.length > 0) && (
          <div className="mt-auto flex min-w-0 items-center gap-1.5 overflow-hidden">
            {task.tally && <TallyIncrement task={task} compact />}
            <DueChip task={task} compact />
            <GroupDots task={task} className="ml-auto" />
          </div>
        )}
      </div>
      {bar && <ItemProgress task={task} className="absolute bottom-1 left-3 right-3 min-w-0" />}
    </div>
  )
}

/**
 * The flat canvas, with no 3D and no sensors: the same groups laid out as the same org chart, on a canvas you drag around and pinch (or
 * scroll) to zoom. Everything the 3D space does works here too: drag a task onto a group (or a folded name) to put it there, or out into
 * the open to leave it floating; drag a group by its name or box to move it, or onto another name to put it inside; hover over a folded
 * name and it opens to show you where things go; tap a name to turn to it, the twirl to fold it.
 */
export function StaticCanvas({ content, layout, fitTick = 0, edgeDots: dotsOn = true, dotsHost = null }: { content: SpatialContent; layout: SpatialLayoutData; fitTick?: number; edgeDots?: boolean; dotsHost?: HTMLElement | null }) {
  const toggleCollapsed = useSpatial((s) => s.toggleCollapsed)
  const tidy = useSpatial((s) => s.tidy)
  const attached = useSpatial((s) => s.attached)
  const drawLines = useSpatial((s) => s.links)
  const box = useRef<HTMLDivElement>(null)
  const [v, setV] = useState({ x: 0, y: 0, k: 1 })
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ x: number; y: number; vx: number; vy: number; d: number; k: number; blank?: boolean; mx?: number; my?: number } | null>(null)
  const [carry, setCarry] = useState<Carry | null>(null)
  const press = useRef<{ pid: number; sx: number; sy: number; kind: 'task' | 'group'; id: string; started: boolean } | null>(null)
  const suppress = useRef(false)
  // a group being made bigger or smaller by a corner dot: what is drawn (springy, between whole sizes) and the nearest whole size (where it lands)
  type Rs = { id: string; edge: Edge; c: number; r: number; open: boolean; snapC: number; snapR: number }
  const [rs, setRs] = useState<Rs | null>(null)
  const rsDrag = useRef<{ pid: number; id: string; edge: Edge; sx: number; sy: number; c0: number; r0: number; minC: number; minR: number; wantC: number; wantR: number; snapC: number; snapR: number; sc: Spring; sr: Spring; open: boolean; raf: number; last: number } | null>(null)
  const rsTick = (t: number) => {
    const d = rsDrag.current
    if (!d) return
    const dt = d.last ? (t - d.last) / 1000 : 1 / 60
    d.last = t
    d.sc = springStep(d.sc, d.wantC, dt)
    d.sr = springStep(d.sr, d.wantR, dt)
    if (!d.open && settled(d.sc, d.wantC) && settled(d.sr, d.wantR)) {
      rsDrag.current = null
      setRs(null)
      return
    }
    setRs({ id: d.id, edge: d.edge, c: d.sc.x, r: d.sr.x, open: d.open, snapC: d.snapC, snapR: d.snapR })
    d.raf = requestAnimationFrame(rsTick)
  }
  useEffect(() => () => cancelAnimationFrame(rsDrag.current?.raf ?? 0), [])
  const sprung = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const live = useRef({ content, v })
  live.current = { content, v }
  // the canvas's size, for the dots along its edge that point to what is out of view
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const dotShown = useRef(new Set<string>())
  // the group a carried task is over shows its empty slots faintly (the same hint as when a group is resized); they fade in, and away once it is let go
  const [slotsFor, setSlotsFor] = useState<{ id: string; on: boolean } | null>(null)
  useEffect(() => {
    const h = carry?.kind === 'task' ? carry.hover : null
    if (h) {
      setSlotsFor({ id: h, on: true })
      return
    }
    setSlotsFor((s) => (s && s.on ? { ...s, on: false } : s))
    const t = window.setTimeout(() => setSlotsFor((s) => (s && !s.on ? null : s)), 500)
    return () => window.clearTimeout(t)
  }, [carry?.kind, carry?.hover])
  // the grid: one line every 32 canvas pixels (doubled while that would be too fine to see), anchored to the canvas's own origin
  let cell = 32 * v.k
  while (cell < 14) cell *= 2
  const gridStyle: React.CSSProperties = {
    backgroundImage: 'linear-gradient(rgb(var(--lr-500) / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--lr-500) / 0.06) 1px, transparent 1px)',
    backgroundSize: `${cell}px ${cell}px`,
    backgroundPosition: `${v.x}px ${v.y}px`,
  }

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
      const rows = Math.max(1, Math.ceil(n / p.cols), p.minRows ?? 1, ...(inGrid.get(c.id) ?? []).map((t) => Math.floor((L.tasks[t.id]?.slot ?? 0) / p.cols) + 1))
      const w = boxW(p.cols)
      out.set(c.id, { x: p.a * p.r * PX - w / 2, y: -(p.y + 1.2 * K) * PY, w, cols: p.cols, n, rows, h: HEAD + (n && !c.collapsed ? boxH(rows) : 0) })
    }
    return out
  }, [content, L, inGrid])
  const kidsOf = (id: string): Set<string> => descendantsOf(content.clusters, id)
  // (the subgroups that travel along with a carried group: none when groups are free-floating)
  const followersOf = (id: string): Set<string> => (attached ? kidsOf(id) : new Set<string>())
  const carriedKids = useMemo(() => (carry?.kind === 'group' ? followersOf(carry.id) : new Set<string>()), [carry?.kind, carry?.id, content, attached]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const pad = Math.min(48, Math.max(14, Math.min(r.width, r.height) * 0.05)) // (a phone has no room to spare)
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

  // a group's tag was clicked in an item's details: the canvas slides to that group (and the item is ringed once it is there)
  const focusReq = useStore((s) => s.focusReq)
  const lastFocus = useRef(0)
  useEffect(() => {
    if (!focusReq || focusReq.at === lastFocus.current) return
    lastFocus.current = focusReq.at
    const own = places.has(focusReq.folderId) ? focusReq.folderId : content.tasks.find((t) => t.id === focusReq.taskId)?.cluster
    if (own && places.has(own)) focus(own)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq])

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
        const col = (c.x - bx.x - PADX) / CELL - 0.5
        const row = (c.y - bx.y - HEAD - PAD_TOP) / (ROW + GAP) - 0.5
        ;({ slot, u, v: vv } = nearestFreeSlot(used, cl.cols, (col - (cl.cols - 1) / 2) * cellW, -(row + 1) * cellH))
      }
      writeLayout({ ...L, tasks: { ...L.tasks, [c.id]: { ...tp, c: over.id, u, v: vv, dz: 0, slot, free: undefined } } })
      if (over.id !== own) retagTask(c.id, over.id)
    } else {
      const free = { a: c.x / PX / r0, y: -c.y / PY }
      // let go in open space: left there, in no group (unsorted, anywhere on the wall)
      writeLayout({ ...L, tasks: { ...L.tasks, [c.id]: { ...tp, c: LOOSE, free: tidy ? snapFree(free) : free } } })
      if (tp.c !== LOOSE) retagTask(c.id, LOOSE)
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
      for (const k of followersOf(c.id)) next[k] = repose(L.clusters[k], L.clusters[k].a + (moved.a - p.a), L.clusters[k].y + (moved.y - p.y))
      if (tidy) {
        // keep tidy: the group snaps to the grid (its subgroups keeping their places around it), and the others make room
        const p1 = snapCluster(moved)
        for (const k of followersOf(c.id)) next[k] = repose(next[k], next[k].a + (p1.a - moved.a), next[k].y + (p1.y - moved.y))
        next[c.id] = p1
        writeLayout({ ...L, clusters: tidyClusters(next, new Set([c.id, ...followersOf(c.id)])) })
      } else writeLayout({ ...L, clusters: separate(next, new Set([c.id, ...followersOf(c.id)])) })
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
  // one small dot for each group or loose card wholly out of view, on the edge where a line from the middle to it crosses (once showing, it stays until well back in view)
  const dots = dotsOn
    ? edgeDots(
        [
          ...content.clusters.flatMap((c) => {
            const b = places.get(c.id)
            return b ? [{ id: c.id, x: b.x + b.w / 2, y: b.y + b.h / 2, r: dotShown.current.has(c.id) ? -40 / v.k : Math.max(b.w, b.h) / 2, hue: c.hue }] : []
          }),
          ...content.tasks.flatMap((t) => {
            const f = L.tasks[t.id]?.free
            return f ? [{ id: `task:${t.id}`, x: f.a * PX * r0, y: -f.y * PY - 20 + ROW / 2, r: dotShown.current.has(`task:${t.id}`) ? -40 / v.k : TASK_W / 2, hue: t.hue }] : []
          }),
        ],
        { scale: v.k, tx: v.x, ty: v.y },
        size.w,
        size.h,
        { inset: -0.5 },
      )
    : []
  dotShown.current = new Set(dots.map((d) => d.id))

  const row = (t: SceneTask, extra?: React.CSSProperties) => <FlatRow key={t.id} t={t} extra={extra} />

  const dotButtons = (
    <>
      {dots.map((d) => (
        <button
          key={d.id}
          type="button"
          className="edge-dot still absolute"
          aria-label={d.id.startsWith('task:') ? 'A task out of view this way: go to it' : 'A group out of view this way: go to it'}
          title={d.id.startsWith('task:') ? 'A task out of view this way' : 'A group out of view this way'}
          style={{ left: d.x, top: d.y, width: 11, height: 11, translate: '-50% -50%', borderRadius: 9999, ['--h' as string]: String(Math.max(0, d.hue)), ['--s' as string]: d.hue < 0 ? '0' : '1' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => (d.id.startsWith('task:') ? setV({ k: v.k, x: size.w / 2 - d.at.x * v.k, y: size.h / 2 - d.at.y * v.k }) : focus(d.id))}
        />
      ))}
    </>
  )

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-none select-none overflow-hidden rounded-[inherit]"
      // the faint grid is part of the canvas: it shifts and scales with the groups, so panning and zooming keep a sense of where things are
      style={gridStyle}
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
          const rd0 = rsDrag.current
          if (rd0?.open) {
            // (a resize that is under way is let go where it began: two fingers are for moving the view)
            rd0.open = false
            rd0.wantC = rd0.c0
            rd0.wantR = rd0.r0
          }
          e.currentTarget.setPointerCapture(e.pointerId)
          const rect0 = box.current!.getBoundingClientRect()
          gesture.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, d: Math.hypot(a.x - b.x, a.y - b.y), k: v.k, mx: (a.x + b.x) / 2 - rect0.left, my: (a.y + b.y) / 2 - rect0.top }
          return
        }
        const el = e.target as HTMLElement
        const handle = el.closest('[data-resize]') as HTMLElement | null
        if (handle) {
          const id = handle.dataset.resize!
          const edge = handle.dataset.edge as Edge
          const pl = places.get(id)
          if (pl) {
            const min = minSizeOf(L, id, edge)
            e.currentTarget.setPointerCapture(e.pointerId)
            cancelAnimationFrame(rsDrag.current?.raf ?? 0)
            rsDrag.current = { pid: e.pointerId, id, edge, sx: e.clientX, sy: e.clientY, c0: pl.cols, r0: pl.rows, minC: min.cols, minR: min.rows, wantC: pl.cols, wantR: pl.rows, snapC: pl.cols, snapR: pl.rows, sc: { x: pl.cols, v: 0 }, sr: { x: pl.rows, v: 0 }, open: true, raf: 0, last: 0 }
            rsDrag.current.raf = requestAnimationFrame(rsTick)
          }
          return
        }
        const taskEl = el.closest('[data-task]') as HTMLElement | null
        const hubEl = el.closest('[data-hub]') as HTMLElement | null
        const boxEl = el.closest('[data-box]') as HTMLElement | null
        if (taskEl || hubEl || boxEl) {
          const id = taskEl?.dataset.task ?? hubEl?.dataset.hub ?? boxEl?.dataset.box ?? ''
          press.current = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, kind: taskEl ? 'task' : 'group', id, started: false }
          return
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        // (`blank`: it began on empty canvas, not on a button over it, so a tap there adds an item)
        gesture.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, d: 0, k: v.k, blank: !el.closest('[data-ui], button') }
      }}
      onPointerMove={(e) => {
        const rd = rsDrag.current
        if (rd && rd.open && rd.pid === e.pointerId) {
          // the pointer says how many columns and rows it is asking for; the size is pulled toward the nearest whole one
          const dx = (e.clientX - rd.sx) / v.k
          const dy = (e.clientY - rd.sy) / v.k
          const c = detent(rd.c0 + (rd.edge === 'right' ? dx : -dx) / CELL, rd.minC, MAX_COLS)
          const r = detent(rd.r0 + dy / (ROW + GAP), rd.minR, MAX_ROWS)
          rd.wantC = c.want
          rd.wantR = r.want
          rd.snapC = c.snap
          rd.snapR = r.snap
          return
        }
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
          // two fingers: the canvas follows where they move together (wherever they went down), and zooms about them as they spread or close
          const dx = g.mx === undefined ? 0 : mx - g.mx
          const dy = g.my === undefined ? 0 : my - g.my
          setV((s) => ({ k, x: mx - ((mx - (s.x + dx)) * k) / s.k, y: my - ((my - (s.y + dy)) * k) / s.k }))
          g.d = Math.hypot(a.x - b.x, a.y - b.y)
          g.k = k
          g.mx = mx
          g.my = my
        } else if (!b) setV((s) => ({ ...s, x: g.vx + e.clientX - g.x, y: g.vy + e.clientY - g.y }))
      }}
      onPointerUp={(e) => {
        const rd = rsDrag.current
        if (rd && rd.open && rd.pid === e.pointerId) {
          // let go: the layout takes the nearest whole size now, and what is drawn settles onto it
          rd.open = false
          rd.wantC = rd.snapC
          rd.wantR = rd.snapR
          if (rd.snapC !== rd.c0 || rd.snapR !== rd.r0) writeLayout(resizeCluster(L, rd.id, rd.snapC, rd.snapR, rd.edge))
          cancelAnimationFrame(rd.raf)
          rd.raf = requestAnimationFrame(rsTick)
          pts.current.delete(e.pointerId) // (this finger is up: it must not be left counting as one of two, or the next drag would zoom)
          gesture.current = null
          return
        }
        pts.current.delete(e.pointerId)
        const pr = press.current
        // a tap on empty canvas: a new item left there
        const g0 = gesture.current
        if (!pr && g0 && g0.blank && !popupWasOpen() && g0.d === 0 && pts.current.size === 0 && Math.hypot(e.clientX - g0.x, e.clientY - g0.y) < MOVE) {
          const c = canvasPoint(e)
          const free = { a: c.x / PX / r0, y: -c.y / PY }
          addLoose(tidy ? snapFree(free).a : free.a, tidy ? snapFree(free).y : free.y)
        }
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
          else if (pr.kind === 'group' && el.closest('[data-box]') && !el.closest('[data-task]') && !el.closest('button') && !popupWasOpen()) addInGroup(pr.id)
          return
        }
        gesture.current = pts.current.size === 1 ? { x: [...pts.current.values()][0].x, y: [...pts.current.values()][0].y, vx: v.x, vy: v.y, d: 0, k: v.k } : null
      }}
      onPointerCancel={(e) => {
        const rd = rsDrag.current
        if (rd && rd.open && rd.pid === e.pointerId) {
          rd.open = false
          rd.wantC = rd.c0
          rd.wantR = rd.r0
          cancelAnimationFrame(rd.raf)
          rd.raf = requestAnimationFrame(rsTick)
          pts.current.delete(e.pointerId)
          gesture.current = null
          return
        }
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
          {drawLines && links.map((c) => {
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
          // being resized (or settling onto its new size): the box is drawn at the springy size, and the cards stay where they are in it
          const rz = rs?.id === c.id ? rs : null
          const wD = rz ? boxW(rz.c) : p.w
          const hD = boxH(rz ? rz.r : p.rows)
          const off = rz && rz.edge === 'left' ? p.w - wD : 0 // (growing to the left pushes the box's left edge out past the group's name)
          // where the whole slots of the size it is heading for would be (the empty ones are shown faintly)
          const slots: { row: number; col: number }[] = []
          let cwN = 0
          let tl = 0
          if (rz) {
            const shift = rz.edge === 'left' ? rz.snapC - p.cols : 0
            const busy = new Set(grid.map((t) => `${Math.floor((L.tasks[t.id]?.slot ?? 0) / p.cols)}:${((L.tasks[t.id]?.slot ?? 0) % p.cols) + shift}`))
            for (let row = 0; row < rz.snapR; row++) for (let col = 0; col < rz.snapC; col++) if (!busy.has(`${row}:${col}`)) slots.push({ row, col })
            cwN = CARD_W
            tl = rz.edge === 'left' ? p.w - boxW(rz.snapC) : 0
          }
          const hue = Math.max(0, c.hue)
          // where a carried task could go in this group: its empty slots, and the one it would take
          const ds = slotsFor?.id === c.id && !c.collapsed && !rz ? slotsFor : null
          const dropSlots: { row: number; col: number; pick: boolean }[] = []
          if (ds) {
            const busy = new Set(grid.filter((t) => !(carry?.kind === 'task' && carry.id === t.id)).map((t) => L.tasks[t.id]?.slot ?? 0))
            const empties: { row: number; col: number; d: number }[] = []
            for (let row = 0; row < p.rows; row++)
              for (let col = 0; col < p.cols; col++) {
                if (busy.has(row * p.cols + col)) continue
                const cx = p.x + PADX + col * CELL + CARD_W / 2
                const cy = p.y + HEAD + PAD_TOP + row * (ROW + GAP) + ROW / 2
                empties.push({ row, col, d: carry ? Math.hypot(carry.x - cx, carry.y - cy) : 0 })
              }
            // (with keep tidy it takes the nearest, otherwise the first free one)
            const first = empties[0]
            const nearest = empties.reduce<(typeof empties)[number] | undefined>((b, e) => (!b || e.d < b.d ? e : b), undefined)
            const pick = ds.on && carry ? (tidy ? nearest : first) : undefined
            for (const e of empties) dropSlots.push({ row: e.row, col: e.col, pick: e === pick })
          }
          return (
            <section key={c.id} className="absolute" style={{ left: p.x, top: p.y, width: p.w, zIndex: dragging || rz ? 5 : 1, opacity: dragging ? 0.92 : 1, transition: carry?.kind === 'group' ? 'none' : 'left 0.38s cubic-bezier(0.3,1.1,0.5,1), top 0.38s cubic-bezier(0.3,1.1,0.5,1)' }} aria-label={c.name}>
              <h3
                data-hub={c.id}
                className={`mb-2 flex cursor-grab items-center gap-1.5 rounded-full px-1 font-display text-2xl font-bold italic transition-colors ${lit ? 'bg-white/80 ring-2 ring-white' : ''}`}
                style={{ color: `hsl(${hue},50%,36%)`, textShadow: '0 0 8px rgba(255,255,255,0.95)' }}
              >
                <button type="button" aria-expanded={!c.collapsed} aria-label={`${c.collapsed ? 'Show' : 'Fold'} ${c.name}`} onClick={() => toggleCollapsed(c.id)} className="grid h-9 w-8 shrink-0 place-items-center text-[2.1rem] leading-none not-italic opacity-75">
                  {c.collapsed ? '▸' : '▾'}
                </button>
                <Flower hue={c.hue} shape={c.shape} size={22} />
                {c.name}
                <span className="rounded-full px-2 text-xs not-italic" style={{ background: `hsl(${hue},60%,90%)` }}>
                  {c.count}
                </span>
              </h3>
              <div
                data-box={c.id}
                className={`relative rounded-[2rem] border transition-shadow ${c.collapsed || grid.length === 0 ? 'hidden' : ''}`}
                style={{ height: hD, ...(rz ? { width: wD, marginLeft: off } : {}), background: `hsl(${hue},60%,${lit ? 78 : 84}%,${lit ? 0.6 : 0.3})`, borderColor: `hsl(${hue},55%,${lit ? 58 : 72}%,${lit ? 0.95 : 0.5})`, borderWidth: lit ? 3 : 1 }}
              >
                {ds && (
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ opacity: ds.on ? 1 : 0, transition: 'opacity 0.45s ease', animation: 'slots-in 0.35s ease' }}>
                    {dropSlots.map(({ row, col, pick }) => (
                      <div key={`${row}:${col}`} className="absolute rounded-2xl border border-dashed transition-colors" style={{ left: PADX + col * CELL - off, top: PAD_TOP + row * (ROW + GAP), width: CARD_W, height: ROW, borderColor: `hsl(${hue},55%,${pick ? 48 : 58}%,${pick ? 0.9 : 0.5})`, background: `hsl(${hue},60%,${pick ? 86 : 92}%,${pick ? 0.7 : 0.4})` }} />
                    ))}
                  </div>
                )}
                {rz && (
                  // the slots there would be at the size it is heading for: faint, fading in as it is dragged and away once it is let go
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ opacity: rz.open ? 1 : 0, transition: 'opacity 0.45s ease', animation: 'slots-in 0.35s ease' }}>
                    {slots.map(({ row, col }) => (
                      <div key={`${row}:${col}`} className="absolute rounded-2xl border border-dashed" style={{ left: tl - off + PADX + col * CELL, top: PAD_TOP + row * (ROW + GAP), width: cwN, height: ROW, borderColor: `hsl(${hue},55%,58%,0.5)`, background: `hsl(${hue},60%,92%,0.4)` }} />
                    ))}
                  </div>
                )}
                {grid.map((t) => {
                  // each card sits in its slot of the group's grid, and glides there when the slot changes
                  const slot = L.tasks[t.id]?.slot ?? 0
                  const cw = CARD_W
                  const ghost = carry?.kind === 'task' && carry.id === t.id
                  return (
                    <div key={t.id} className="absolute z-[1]" style={{ left: PADX + (slot % p.cols) * CELL - off, top: PAD_TOP + Math.floor(slot / p.cols) * (ROW + GAP), width: cw, transition: carry || rz ? 'none' : 'left 0.32s cubic-bezier(0.3,1.1,0.5,1), top 0.32s cubic-bezier(0.3,1.1,0.5,1)' }}>
                      {row(t, ghost ? { opacity: 0.3 } : undefined)}
                    </div>
                  )
                })}
                {/* the grips: a dot in each bottom corner, to give the group more room (or take it back) a column and a row at a time */}
                {(['left', 'right'] as const).map((edge) => (
                  <span
                    key={edge}
                    data-resize={c.id}
                    data-edge={edge}
                    role="presentation"
                    title="Drag to make this group bigger or smaller"
                    className={`absolute bottom-[2px] z-[2] grid h-6 w-6 touch-none place-items-center ${edge === 'left' ? 'left-[2px] cursor-nesw-resize' : 'right-[2px] cursor-nwse-resize'}`}
                    style={colorVars(c.hue, 0.5)}
                  >
                    <span className="emboss-dot emboss-dot-tint" />
                  </span>
                ))}
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
      {dotsHost ? createPortal(dotButtons, dotsHost) : dotButtons}
      <div data-ui className="absolute bottom-3 right-3 z-10">
        <ZoomControl onZoom={(f) => zoomAt(f, centre().x, centre().y)} />
      </div>
    </div>
  )
}
