import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { satOf, tint } from '../../core/color'
import { plink } from '../../audio/engine'
import { boundsOf, fitView, stepSim, WATER_FEEL, type SimNode } from '../../core/flock'
import { groupTasks, layoutClusters, pairKey, relations } from '../../core/groups'
import { contactLink, detectContactIntent } from '../../core/people'
import { bubbleRadius, habitStreak, plannedDate } from '../../core/tasks'
import type { Task, TaskKind } from '../../core/types'
import { useStore } from '../../state/store'
import { IconBell, IconChat, IconList, IconMail, IconPhone, IconThought } from '../icons'
import { DoneButton, DueChip } from '../shared'
import { openCompose, type ComposePreset } from '../NewTask'
import { Tip } from '../Tip'
import { useFloatDrag } from '../useFloatDrag'
import { useLeaveClass, useSearchMatcher, useVisibleTasks } from '../useVisible'
import { WATER } from '../water'
import { WaterRipples, type WaterHandle } from '../WaterRipples'

const MIN_SCALE = 0.2
const MAX_SCALE = 3

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [ref])
  return size
}

// stable pseudo-random motion per task so bubbles don't re-sync on re-render
function motion(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return { cls: (['drift-a', 'drift-b', 'drift-c'] as const)[h % 3], dur: 9 + (h % 8), delay: -(h % 13) }
}

interface View {
  scale: number
  tx: number
  ty: number
}

/** Everything a bubble needs from the pond, kept in one stable object. */
interface PondApi {
  container: React.RefObject<HTMLDivElement | null>
  view: React.MutableRefObject<View>
  dims: React.MutableRefObject<{ w: number; h: number }>
  register: (id: string, outer: HTMLElement | null, jig: HTMLElement | null) => void
  getFrac: (id: string) => { x: number; y: number }
  drag: (id: string, fx: number, fy: number) => void
  grab: (id: string) => void
  release: (id: string, committed: boolean) => void
  /** Only in Free mode do drags change a bubble's saved position. */
  isFree: () => boolean
}

const Lily = memo(function Lily({ task, r, api, start, match }: { task: Task; r: number; api: PondApi; start: { x: number; y: number }; match: boolean | null }) {
  const update = useStore((s) => s.updateTask)
  const drift = useStore((s) => s.settings.drift)
  const folders = useStore((s) => s.folders)
  const person = useStore((s) => s.people.find((p) => task.personIds.includes(p.id) && (p.phone || p.email)))
  const leave = useLeaveClass(task)
  const m = useMemo(() => motion(task.id), [task.id])
  const fresh = useRef(Date.now() - task.createdAt < 1500).current
  const hue = useMemo(() => {
    const f = folders.find((x) => x.id === task.folderIds[0])
    return f ? f.hue : task.kind === 'idea' ? 320 : task.kind === 'list' ? 200 : task.kind === 'event' ? 40 : task.kind === 'habit' ? 150 : 285
  }, [folders, task.folderIds, task.kind])

  const outer = useRef<HTMLDivElement>(null)
  const jig = useRef<HTMLDivElement>(null)
  useEffect(() => {
    api.register(task.id, outer.current, jig.current)
    return () => api.register(task.id, null, null)
  }, [api, task.id])

  const toClient = useCallback(
    (fx: number, fy: number) => {
      const rc = api.container.current!.getBoundingClientRect()
      const { w, h } = api.dims.current
      const v = api.view.current
      return { cx: rc.left + v.tx + fx * w * v.scale, cy: rc.top + v.ty + fy * h * v.scale }
    },
    [api],
  )
  const fromClient = useCallback(
    (cx: number, cy: number) => {
      const rc = api.container.current!.getBoundingClientRect()
      const { w, h } = api.dims.current
      const v = api.view.current
      return { fx: (cx - rc.left - v.tx) / v.scale / w, fy: (cy - rc.top - v.ty) / v.scale / h }
    },
    [api],
  )

  const { onPointerDown } = useFloatDrag(
    task,
    api.container,
    () => api.getFrac(task.id),
    (x, y) => api.isFree() && update(task.id, { x, y }),
    {
      toClient,
      fromClient,
      clamp: { minX: -3, maxX: 4, minY: -3, maxY: 4 },
      onGrab: () => api.grab(task.id),
      onDrag: (fx, fy) => api.drag(task.id, fx, fy),
      onRelease: (committed) => api.release(task.id, committed),
    },
  )

  const done = task.status === 'done'
  const font = Math.max(11, Math.min(15, r / 4.4))
  // the check circle grows with the bubble, but stays a modest size
  const cb = Math.round(Math.max(22, Math.min(28, r * 0.4)))
  const verb = detectContactIntent(task.title)?.verb
  const link = person && verb ? contactLink(verb, person) : null

  return (
    <div
      ref={outer}
      data-node
      className="absolute left-0 top-0 will-change-transform"
      style={{ width: r * 2, height: r * 2, transform: `translate(${start.x - r}px, ${start.y - r}px)` }}
    >
      <div ref={jig} className="h-full w-full">
        <div className={`h-full w-full ${fresh ? 'bloom-in' : ''} ${leave}`}>
          <div
            className={`h-full w-full ${drift ? m.cls : ''}`}
            style={{ '--dur': `${m.dur}s`, '--delay': `${m.delay}s` } as React.CSSProperties}
          >
            <div
              role="button"
              tabIndex={0}
              onPointerDown={(e) => onPointerDown(e, true)}
              onKeyDown={(e) => e.key === 'Enter' && useStore.getState().select(task.id)}
              className={`pad group relative flex h-full w-full cursor-grab touch-none select-none flex-col items-center justify-center rounded-full px-3 pb-9 pt-3 text-center outline-none transition-[opacity,transform,filter] duration-500 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-lilac-500 ${
                done ? 'opacity-55 saturate-50' : ''
              } ${match === false ? 'opacity-[0.22] saturate-[0.4]' : match ? 'search-hit' : ''}`}
              style={{ '--h': Math.max(0, hue), '--s': satOf(hue) } as React.CSSProperties}
            >
              <span className={`line-clamp-2 break-words font-display leading-[1.15] ${done ? 'line-through decoration-lilac-300' : ''}`} style={{ fontSize: font }}>
                {task.title || 'Untitled'}
              </span>
              {r >= 58 && plannedDate(task) && (
                <span className="mt-1 scale-90">
                  <DueChip task={task} compact />
                </span>
              )}
              {/* the action row sits at the bottom of the bubble: checkbox (or idea mark), reminder bell, contact link */}
              <span className="absolute bottom-[9%] left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                {task.kind === 'idea' ? (
                  <span title="Idea" role="img" aria-label="Idea" className="grid place-items-center text-lilac-500" style={{ width: cb, height: cb }}>
                    <IconThought size={cb} />
                  </span>
                ) : (
                  <DoneButton task={task} size={cb} />
                )}
                {((task.remindAt !== null && !task.reminded) || (task.alerts?.length ?? 0) > 0) && (
                  <span title="Reminder set" role="img" aria-label="Reminder set" className="text-lilac-500">
                    <IconBell size={15} />
                  </span>
                )}
                {!!task.repeat || task.kind === 'habit' ? habitStreak(task) > 0 && (
                  <span title={`${habitStreak(task)}-day streak`} className="flex items-center gap-0.5 text-[0.7rem] tabular-nums text-lilac-600">
                    ↻ {habitStreak(task)}
                  </span>
                ) : null}
                {task.kind === 'list' && (
                  <span title="List" className="flex items-center gap-0.5 text-[0.7rem] tabular-nums text-lilac-600">
                    <IconList size={14} />
                    {task.listStyle === 'check' && task.items.length > 0 ? `${task.items.filter((i) => i.done).length}/${task.items.length}` : task.items.length || ''}
                  </span>
                )}
                {link && (
                  <a
                    href={link.href}
                    title={`${link.label} ${person!.name.split(' ')[0]}`}
                    aria-label={`${link.label} ${person!.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="pop-in grid shrink-0 place-items-center rounded-full bg-lilac-500 text-white shadow-md shadow-lilac-500/40 transition hover:scale-110 hover:bg-lilac-600"
                    style={{ width: cb, height: cb }}
                  >
                    {link.label === 'Email' ? <IconMail size={13} /> : link.label === 'Text' ? <IconChat size={13} /> : <IconPhone size={13} />}
                  </a>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

interface Rec {
  sim: SimNode
  bumped: number
}

export function Pond() {
  const visible = useVisibleTasks(false, 'keep') // a search fades the others here instead of removing them
  const matcher = useSearchMatcher()
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const scale = useStore((s) => s.settings.sizeByPriority)
  const group = useStore((s) => s.settings.pondGroup)
  /** The + beside a cluster's name: a new item that already belongs to it (where that means something). */
  const addHere = (key: string): ComposePreset | null =>
    key === 'none' || key === 'all' ? null : group === 'folder' ? { folderIds: [key] } : group === 'person' ? { personIds: [key] } : group === 'kind' ? { kind: key as TaskKind } : null
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const select = useStore((s) => s.select)

  const ref = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(ref)
  const dims = useRef({ w: 0, h: 0 })
  dims.current = { w, h }
  const view = useRef<View>({ scale: 1, tx: 0, ty: 0 })
  const nodes = useRef(new Map<string, Rec>())
  // DOM elements register themselves before their sim node exists, so they live apart
  const els = useRef(new Map<string, { outer: HTMLElement; jig: HTMLElement }>())
  const raf = useRef(0)
  const running = useRef(false)
  const grabbed = useRef(0)
  const [offscreen, setOffscreen] = useState(false)
  const [labels, setLabels] = useState<{ key: string; label: string; x: number; y: number; hue?: number; path?: { id: string; name: string }[] }[]>([])
  const labelsRef = useRef(labels)

  /* cluster physics (grouped modes) */
  interface Cluster {
    key: string
    cx: number
    cy: number
    R: number
    ids: string[]
    base: Map<string, { x: number; y: number }>
  }
  const clusters = useRef(new Map<string, Cluster>())
  const shifts = useRef(new Map<string, { dx: number; dy: number }>())
  const groupOf = useRef(new Map<string, string>())
  const labelEls = useRef(new Map<string, HTMLElement>())
  // group names ride the same springs as the bubbles instead of snapping
  const labelSt = useRef(new Map<string, { x: number; y: number; vx: number; vy: number; pinned: boolean }>())
  const dragRef = useRef<{ id: string; key: string | null; home0: { x: number; y: number }; shift0: { dx: number; dy: number }; t: number; t0: number; x: number; y: number; v: number; slow: number; fast: number; broken: boolean; joined: boolean } | null>(null)
  const [hot, setHot] = useState<string | null>(null)

  /** The group's title is a handle: dragging it carries the whole cluster. */
  const dragLabel = (e: React.PointerEvent, key: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const c = clusters.current.get(key)
    if (!c) return
    const sx = e.clientX
    const sy = e.clientY
    const sh0 = shifts.current.get(key) ?? { dx: 0, dy: 0 }
    document.body.classList.add('dragging')
    grabbed.current += 1
    const st0 = labelSt.current.get(key) ?? { x: sh0.dx, y: sh0.dy, vx: 0, vy: 0, pinned: false }
    st0.pinned = true
    labelSt.current.set(key, st0)
    const move = (ev: PointerEvent) => {
      const k = view.current.scale
      const sh = { dx: sh0.dx + (ev.clientX - sx) / k, dy: sh0.dy + (ev.clientY - sy) / k }
      shifts.current.set(key, sh)
      for (const id of c.ids) {
        const m = nodes.current.get(id)
        const b = c.base.get(id)
        if (m && b) {
          m.sim.hx = b.x + sh.dx
          m.sim.hy = b.y + sh.dy
        }
      }
      wake()
    }
    const up = () => {
      st0.pinned = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.classList.remove('dragging')
      grabbed.current = Math.max(0, grabbed.current - 1)
      wake()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const hotRef = useRef<string | null>(null)

  const rf = Math.min(1, Math.max(0.72, w / 900))
  const radius = useCallback((t: Task) => Math.round(bubbleRadius(t, scale) * rf), [scale, rf])
  const rel = useMemo(() => relations(visible), [visible])

  const live = useRef({ rel, group })
  live.current = { rel, group }
  const FOLLOW_DELAY = 160 // ms the cluster waits before following, so a quick yank is spotted first
  const JOIN_SPEED = 0.55 // px/ms: a loose bubble bumping into another cluster this fast becomes part of it
  const BREAK_SPEED = 1.1 // px/ms (~1100px/s), sustained: faster than this snaps a bubble free of its cluster

  /* ---------- view transform ---------- */
  const checkOffscreen = useCallback(() => {
    const { w: W, h: H } = dims.current
    const v = view.current
    let off = false
    for (const n of nodes.current.values()) {
      const sx = n.sim.x * v.scale + v.tx
      const sy = n.sim.y * v.scale + v.ty
      if (sx < -n.sim.r * v.scale * 0.5 || sy < -n.sim.r * v.scale * 0.5 || sx > W + n.sim.r * v.scale * 0.5 || sy > H + n.sim.r * v.scale * 0.5) {
        off = true
        break
      }
    }
    setOffscreen((p) => (p === off ? p : off))
  }, [])

  const applyView = useCallback(
    (animate = false) => {
      const el = worldRef.current
      if (!el) return
      const v = view.current
      el.style.transition = animate ? 'transform .7s cubic-bezier(.2,.8,.2,1)' : 'none'
      el.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`
      if (animate) window.setTimeout(() => (el.style.transition = 'none'), 750)
      checkOffscreen()
    },
    [checkOffscreen],
  )

  const zoomAbout = useCallback(
    (factor: number, px: number, py: number) => {
      const v = view.current
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const k = s / v.scale
      view.current = { scale: s, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k }
      applyView()
    },
    [applyView],
  )

  const frameAll = useCallback(
    (fromHomes = false) => {
      const list = [...nodes.current.values()].map((n) => ({ x: fromHomes ? n.sim.hx : n.sim.x, y: fromHomes ? n.sim.hy : n.sim.y, r: n.sim.r }))
      // group titles count too, so none is framed out of view
      for (const l of labelsRef.current) list.push({ x: l.x, y: l.y, r: 40 })
      const b = boundsOf(list)
      const { w: W, h: H } = dims.current
      view.current = b ? fitView(b, W, H, 56) : { scale: 1, tx: 0, ty: 0 }
      applyView(true)
    },
    [applyView],
  )

  /* ---------- simulation ---------- */
  const paint = useCallback(() => {
    for (const n of nodes.current.values()) {
      const e = els.current.get(n.sim.id)
      if (e) e.outer.style.transform = `translate(${n.sim.x - n.sim.r}px, ${n.sim.y - n.sim.r}px)`
    }
  }, [])

  const wake = useCallback(() => {
    if (running.current) return
    running.current = true
    const tick = () => {
      const { rel: r, group: g } = live.current
      const list = [...nodes.current.values()].map((n) => n.sim)
      const { bumps, energy } = stepSim(
        list,
        { home: g === 'free' ? WATER_FEEL.homeFree : WATER_FEEL.homeGrouped, magnet: g === 'free' ? WATER_FEEL.magnet : 0, damping: g === 'free' ? WATER_FEEL.dampingFree : WATER_FEEL.damping, push: WATER_FEEL.push },
        (a, b) => r.related.has(pairKey(a, b)),
      )
      paint()
      let labelEnergy = 0
      for (const [key, el] of labelEls.current) {
        const t = shifts.current.get(key) ?? { dx: 0, dy: 0 }
        let st = labelSt.current.get(key)
        if (!st) labelSt.current.set(key, (st = { x: t.dx, y: t.dy, vx: 0, vy: 0, pinned: false }))
        if (st.pinned) {
          st.x = t.dx
          st.y = t.dy
          st.vx = st.vy = 0
        } else {
          st.vx = (st.vx + (t.dx - st.x) * WATER_FEEL.homeGrouped) * WATER_FEEL.damping
          st.vy = (st.vy + (t.dy - st.y) * WATER_FEEL.homeGrouped) * WATER_FEEL.damping
          st.x += st.vx
          st.y += st.vy
        }
        el.style.transform = `translate(${st.x}px, ${st.y}px)`
        labelEnergy += st.vx * st.vx + st.vy * st.vy
      }
      const now = performance.now()
      for (const bump of bumps) {
        const n = nodes.current.get(bump.id)
        const jig = els.current.get(bump.id)?.jig
        if (n && jig && bump.strength > 1.5 && now - n.bumped > 700) {
          n.bumped = now
          jig.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.035, 0.97)' }, { transform: 'scale(0.99, 1.01)' }, { transform: 'scale(1)' }],
            { duration: 700, easing: 'ease-out' },
          )
        }
      }
      if (nodes.current.size && (energy + labelEnergy > 0.02 || grabbed.current > 0)) raf.current = requestAnimationFrame(tick)
      else {
        running.current = false
        checkOffscreen()
      }
    }
    raf.current = requestAnimationFrame(tick)
  }, [paint, checkOffscreen])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  /* sync sim nodes with tasks, homes and radii */
  const prevGroup = useRef(group)
  useEffect(() => {
    if (!w || !h) return
    const homes = new Map<string, { x: number; y: number }>()
    const nextLabels: typeof labels = []
    if (prevGroup.current !== group) shifts.current.clear()
    clusters.current = new Map()
    groupOf.current = new Map()
    if (group === 'free') {
      for (const t of visible) homes.set(t.id, { x: t.x * w, y: t.y * h })
    } else {
      const groups = groupTasks(visible, group, folders, people, undefined, scopeRef.current.type === 'folder' ? scopeRef.current.id : undefined)
      const avgR = visible.length ? visible.reduce((s, t) => s + radius(t), 0) / visible.length : 50
      const spacing = avgR * 1.45
      const blob = (n: number) => spacing * Math.sqrt(n) + avgR
      // clusters sit far enough apart never to touch; "Frame all" then zooms to fit
      const centers = layoutClusters(groups.map((g) => blob(g.taskIds.length)), w / h)
      groups.forEach((g, gi) => {
        const cx = w / 2 + centers[gi].x
        const cy = h / 2 + centers[gi].y
        const base = new Map<string, { x: number; y: number }>()
        g.taskIds.forEach((id, i) => {
          const a = i * 2.39996
          const rad = spacing * Math.sqrt(i)
          const pos = { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad }
          homes.set(id, pos)
          base.set(id, pos)
          groupOf.current.set(id, g.key)
        })
        clusters.current.set(g.key, { key: g.key, cx, cy, R: blob(g.taskIds.length), ids: g.taskIds, base })
        // hug the cluster: centred over its bubbles, just above the topmost one
        const rOf = new Map(visible.map((t) => [t.id, radius(t)]))
        let top = Infinity
        let sumX = 0
        for (const [id, pos] of base) {
          top = Math.min(top, pos.y - (rOf.get(id) ?? avgR))
          sumX += pos.x
        }
        nextLabels.push({ key: g.key, label: g.label, hue: g.hue, path: g.path, x: sumX / Math.max(1, base.size), y: top - 40 })
      })
    }
    setLabels(nextLabels)
    labelsRef.current = nextLabels

    const map = nodes.current
    const ids = new Set(visible.map((t) => t.id))
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id)
    for (const t of visible) {
      const base = homes.get(t.id)!
      const sh = shifts.current.get(groupOf.current.get(t.id) ?? '')
      const home = sh ? { x: base.x + sh.dx, y: base.y + sh.dy } : base
      const r = radius(t)
      const rec = map.get(t.id)
      if (rec) {
        rec.sim.hx = home.x
        rec.sim.hy = home.y
        rec.sim.r = r
      } else {
        map.set(t.id, { sim: { id: t.id, x: home.x, y: home.y, vx: 0, vy: 0, hx: home.x, hy: home.y, r, pinned: false }, bumped: 0 })
      }
    }
    paint()
    wake()
    if (prevGroup.current !== group) {
      prevGroup.current = group
      window.setTimeout(() => frameAll(true), 60)
    }
  }, [visible, group, w, h, radius, folders, people, paint, wake, frameAll])

  const api: PondApi = useMemo(
    () => ({
      container: ref,
      view,
      dims,
      register: (id, outer, jig) => {
        if (outer && jig) els.current.set(id, { outer, jig })
        else els.current.delete(id)
      },
      getFrac: (id) => {
        const n = nodes.current.get(id)
        return n ? { x: n.sim.x / dims.current.w, y: n.sim.y / dims.current.h } : { x: 0.5, y: 0.5 }
      },
      isFree: () => live.current.group === 'free',
      grab: (id) => {
        const n = nodes.current.get(id)
        if (n) n.sim.pinned = true
        grabbed.current += 1
        const key = groupOf.current.get(id)
        const c = key ? clusters.current.get(key) : undefined
        const base = c?.base.get(id)
        if (n && key && c && base) {
          const sh = shifts.current.get(key) ?? { dx: 0, dy: 0 }
          dragRef.current = { id, key, home0: { x: n.sim.x, y: n.sim.y }, shift0: sh, t: 0, t0: 0, x: n.sim.x, y: n.sim.y, v: 0, slow: 0, fast: 0, broken: false, joined: false }
        } else dragRef.current = null
        wake()
      },
      drag: (id, fx, fy) => {
        const n = nodes.current.get(id)
        if (!n) return
        const px = fx * dims.current.w
        const py = fy * dims.current.h
        n.sim.x = px
        n.sim.y = py
        const d = dragRef.current
        if (!d || d.id !== id || !d.key) return
        const now = performance.now()
        if (d.t === 0) {
          // first sample: the pointer has only just crossed the drag threshold, so there is no speed yet
          d.t = now
          d.t0 = now
        } else {
          // floor dt: two events in the same millisecond must not read as a flick
          const speed = (Math.hypot(px - d.x, py - d.y) / Math.max(10, now - d.t)) * view.current.scale
          d.v = 0.5 * d.v + 0.5 * speed
          // a hard flick, or a sudden jump well above how fast we've been dragging (after a settling moment)
          const yank = now - d.t0 > 300 && d.v > 0.55 && d.v > 1.9 * d.slow + 0.2
          d.fast = d.v > BREAK_SPEED || yank ? d.fast + 1 : 0
          d.slow = 0.92 * d.slow + 0.08 * d.v
          d.t = now
        }
        d.x = px
        d.y = py

        /** The cluster lets go: anything it had started to follow is undone and it springs back to where it was. */
        const letGo = () => {
          const own = d.key ? clusters.current.get(d.key) : undefined
          if (!own) return
          shifts.current.set(own.key, d.shift0)
          for (const mid of own.ids) {
            const m = nodes.current.get(mid)
            const b = own.base.get(mid)
            if (m && b && mid !== id) {
              m.sim.hx = b.x + d.shift0.dx
              m.sim.hy = b.y + d.shift0.dy
            }
          }
        }
        const wobble = (who: string) =>
          els.current.get(who)?.jig.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14, 0.9)' }, { transform: 'scale(0.96, 1.05)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' })

        if (!d.broken && d.fast >= 2) {
          // surface tension snaps (a hard flick, or a sudden yank after a slower drag): the bubble is on its own now
          d.broken = true
          plink()
          letGo()
          wobble(id)
        }

        // the reverse: bumping fast into another cluster's bubbles pulls this one into that cluster
        if (!d.joined && d.v > JOIN_SPEED && live.current.group !== 'free') {
          for (const [mid, m] of nodes.current) {
            if (mid === id) continue
            const k = groupOf.current.get(mid)
            if (!k || k === d.key) continue
            if (Math.hypot(m.sim.x - px, m.sim.y - py) < n.sim.r + m.sim.r + 4) {
              d.joined = true
              if (!d.broken) {
                d.broken = true
                letGo()
              }
              plink()
              wobble(id)
              wobble(mid)
              useStore.getState().assignToGroup(id, live.current.group, k)
              hotRef.current = k
              setHot(k)
              window.setTimeout(() => {
                if (hotRef.current === k) {
                  hotRef.current = null
                  setHot(null)
                }
              }, 700)
              break
            }
          }
        }
        const c = clusters.current.get(d.key)
        if (!d.broken && !d.joined && c && now - d.t0 > FOLLOW_DELAY) {
          // slow drag: the whole cluster follows on its rubber band (members spring towards their shifted homes)
          const sh = { dx: d.shift0.dx + (px - d.home0.x), dy: d.shift0.dy + (py - d.home0.y) }
          shifts.current.set(d.key, sh)
          for (const mid of c.ids) {
            const m = nodes.current.get(mid)
            const b = c.base.get(mid)
            if (m && b) {
              m.sim.hx = b.x + sh.dx
              m.sim.hy = b.y + sh.dy
            }
          }
        } else if (d.broken) {
          // carrying a loose bubble: light up the cluster it would join
          let best: string | null = null
          let bestD = Infinity
          for (const k of clusters.current.values()) {
            const sh = shifts.current.get(k.key)
            const dist = Math.hypot(px - (k.cx + (sh?.dx ?? 0)), py - (k.cy + (sh?.dy ?? 0)))
            if (k.key !== d.key && dist < k.R * 1.25 + n.sim.r && dist < bestD) {
              best = k.key
              bestD = dist
            }
          }
          if (hotRef.current !== best) {
            hotRef.current = best
            setHot(best)
          }
        }
        wake()
      },
      release: (id, committed) => {
        const n = nodes.current.get(id)
        const d = dragRef.current
        dragRef.current = null
        if (n) n.sim.pinned = false
        grabbed.current = Math.max(0, grabbed.current - 1)
        const target = hotRef.current
        hotRef.current = null
        setHot(null)
        if (d?.broken && committed && target && live.current.group !== 'free') {
          useStore.getState().assignToGroup(id, live.current.group, target)
        }
        wake()
      },
    }),
    [wake],
  )

  /* ---------- pan / pinch / tap-to-add ---------- */
  const water = useRef<WaterHandle>(null)

  /** Each bubble lifts as the wave front reaches it (same speed as the shader's), more gently the farther it is. */
  const wave = useCallback((sx: number, sy: number, edge: number, strength: number) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const v = view.current
    for (const [id, n] of nodes.current) {
      const e = els.current.get(id)
      if (!e) continue
      const d = Math.max(0, Math.hypot(n.sim.x * v.scale + v.tx - sx, n.sim.y * v.scale + v.ty - sy) - edge)
      const amp = (strength * Math.exp(-d / 260)) / (1 + d / 140)
      if (amp < 0.05) continue
      e.jig.animate(
        [
          { transform: 'translateY(0px) scale(1)' },
          { transform: `translateY(${-4.5 * amp}px) scale(${1 + 0.022 * amp})` },
          { transform: `translateY(${1.5 * amp}px) scale(${1 - 0.005 * amp})` },
          { transform: 'translateY(0px) scale(1)' },
        ],
        { duration: 2400, delay: (d / WATER.speed) * 1000, easing: 'ease-in-out', composite: 'add' },
      )
    }
  }, [])

  const spawnRipple = useCallback(
    (kind: 'circle' | 'box', x: number, y: number, w = 0, h = 0) => {
      const strength = kind === 'box' ? 0.9 : 0.7
      // a circle may carry its own size (the bubble that just landed); a bare drop is a small one
      const hw = kind === 'box' ? w / 2 : w ? w / 2 : 9
      const hh = kind === 'box' ? h / 2 : h ? h / 2 : 9
      water.current?.ripple(x, y, { hw, hh, strength })
      wave(x, y, kind === 'box' ? (w + h) / 4 : hw, strength)
    },
    [wave],
  )

  // a new item (from the quick-add box) lands: ripple from where its bubble really is
  useEffect(() => {
    const onAdded = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id
      let tries = 0
      const ring = () => {
        const n = nodes.current.get(id)
        if (!n) return tries++ < 30 ? void requestAnimationFrame(ring) : undefined
        const cv = view.current
        const d = 2 * n.sim.r * cv.scale
        spawnRipple('circle', n.sim.x * cv.scale + cv.tx, n.sim.y * cv.scale + cv.ty, d, d)
      }
      requestAnimationFrame(ring)
    }
    window.addEventListener('lilac:added', onAdded)
    return () => window.removeEventListener('lilac:added', onAdded)
  }, [spawnRipple])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ptrs = new Map<number, { x: number; y: number }>()
    let mode: 'none' | 'tap' | 'pan' | 'pinch' = 'none'
    let base = { x: 0, y: 0, v: view.current, dist: 1, mid: { x: 0, y: 0 } }

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const rebase = () => {
      const pts = [...ptrs.values()]
      const mid = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]
      base = { x: pts[0].x, y: pts[0].y, v: { ...view.current }, dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1 : 1, mid }
    }

    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      ptrs.set(e.pointerId, local(e))
      const pts = [...ptrs.values()]
      if (pts.length >= 2) {
        mode = 'pinch'
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, base.v.scale * (dist / base.dist)))
        const wx = (base.mid.x - base.v.tx) / base.v.scale
        const wy = (base.mid.y - base.v.ty) / base.v.scale
        view.current = { scale: s, tx: mid.x - wx * s, ty: mid.y - wy * s }
        applyView()
        return
      }
      const dx = pts[0].x - base.x
      const dy = pts[0].y - base.y
      if (mode === 'tap' && Math.hypot(dx, dy) > 6) {
        mode = 'pan'
        el.style.cursor = 'grabbing'
      }
      if (mode === 'pan') {
        view.current = { ...base.v, tx: base.v.tx + dx, ty: base.v.ty + dy }
        applyView()
      }
    }
    const up = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      const p = local(e)
      ptrs.delete(e.pointerId)
      if (ptrs.size === 0) {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (mode === 'tap' && e.type === 'pointerup') {
          select(null)
          const v = view.current
          const { w: W, h: H } = dims.current
          openCompose({ x: (p.x - v.tx) / v.scale / W, y: (p.y - v.ty) / v.scale / H })
        }
        mode = 'none'
        el.style.cursor = ''
        checkOffscreen()
      } else {
        mode = 'pan' // lifted one finger of a pinch: carry on panning, never create
        rebase()
      }
    }
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-node],[data-ui]')) return
      if (e.button !== 0 && e.pointerType === 'mouse') return
      if (ptrs.size === 0) {
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
      }
      ptrs.set(e.pointerId, local(e))
      mode = ptrs.size >= 2 ? 'pinch' : 'tap'
      rebase()
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Shift + wheel (or a sideways scroll) slides the view
        const v = view.current
        view.current = { ...v, tx: v.tx - (e.deltaX || e.deltaY) * unit, ty: v.ty - (e.deltaX ? e.deltaY : 0) * unit }
        applyView()
        return
      }
      // The wheel zooms about the cursor (one mouse notch is a gentle step); a trackpad pinch arrives as ctrl + wheel
      const k = e.ctrlKey ? 0.01 : 0.0018
      const factor = Math.min(1.45, Math.max(0.69, Math.exp(-e.deltaY * unit * k)))
      zoomAbout(factor, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [applyView, zoomAbout, select, checkOffscreen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      className="relative h-full w-full cursor-[crosshair] touch-none overflow-hidden rounded-[2rem] border border-white/70 shadow-[0_20px_60px_-24px_rgba(107,68,145,0.35)]"
      style={{
        background:
          'radial-gradient(70% 60% at 30% 20%, rgba(255,255,255,0.75), transparent 70%), radial-gradient(60% 60% at 80% 90%, rgba(225,208,244,0.55), transparent 70%), linear-gradient(160deg, rgba(255,255,255,0.5), rgba(240,231,250,0.45))',
      }}
      aria-label="Pond canvas. Tap the water to add a thought. Drag to pan, pinch to zoom."
    >
      <div ref={worldRef} className="absolute left-0 top-0 origin-top-left" style={{ width: w, height: h, transform: 'translate(0px,0px) scale(1)' }}>
        {labels.map((l) => (
          <div
            key={l.key}
            ref={(el) => {
              if (!el) return void labelEls.current.delete(l.key)
              labelEls.current.set(l.key, el)
              const st = labelSt.current.get(l.key)
              el.style.transform = st ? `translate(${st.x}px, ${st.y}px)` : ''
            }}
            className="absolute"
            style={{ left: l.x, top: l.y }}
          >
            <div
              data-ui
              onPointerDown={(e) => dragLabel(e, l.key)}
              title="Drag to move this whole group"
              style={{ color: l.hue === undefined ? 'var(--color-lilac-700)' : `${tint(l.hue, 50, 36)}` }}
              className={`pop-in -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none whitespace-nowrap rounded-full px-3.5 py-1 font-display font-bold italic transition-all duration-300 hover:bg-white/60 hover:shadow-sm ${
                hot === l.key ? 'scale-110 bg-white/70 text-4xl' : 'text-3xl opacity-90'
              }`}
            >
              {l.path && l.path.length > 1 ? (
                // a breadcrumb: the folders above are lighter, italic, underlined links that move up a level
                l.path.map((c, i) =>
                  i < l.path!.length - 1 ? (
                    <span key={c.id}>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setScope({ type: 'folder', id: c.id })}
                        className="text-[0.62em] font-normal underline decoration-1 underline-offset-[5px] opacity-70 transition hover:opacity-100"
                      >
                        {c.name}
                      </button>
                      <span className="mx-1.5 text-[0.62em] font-normal opacity-60" aria-hidden>
                        ›
                      </span>
                    </span>
                  ) : (
                    <span key={c.id}>{c.name}</span>
                  ),
                )
              ) : (
                l.label
              )}
              {addHere(l.key) && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => openCompose(null, addHere(l.key)!)}
                  aria-label={`New item in ${l.label}`}
                  title={`New item in ${l.label}`}
                  className="ml-2 inline-grid h-6 w-6 -translate-y-0.5 place-items-center rounded-full bg-white/65 align-middle font-sans text-base font-normal not-italic leading-none text-lilac-700 shadow-sm transition hover:scale-110 hover:bg-white"
                >
                  +
                </button>
              )}
            </div>
          </div>
        ))}

        {w > 0 &&
          visible.map((t) => <Lily key={t.id} task={t} r={radius(t)} api={api} start={{ x: t.x * w, y: t.y * h }} match={matcher ? matcher(t) : null} />)}
      </div>

      <WaterRipples ref={water} className="z-10" />

      {visible.length === 0 && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-8 text-center font-display text-xl italic text-ink-faint">Touch the water to float an idea…</p>
      )}
      {visible.length > 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 hidden pl-5 pr-60 text-left text-xs text-ink-faint/80 sm:block">Click the water to add · drag to wander · scroll or pinch to zoom · drop a lily on a group to tag it</p>
      )}

      <div data-ui className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5">
        <Tip label="Zoom out">
          <button onClick={() => zoomAbout(1 / 1.35, w / 2, h / 2)} className="glass-soft grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-white/80">
            −
          </button>
        </Tip>
        <Tip label="Zoom in">
          <button onClick={() => zoomAbout(1.35, w / 2, h / 2)} className="glass-soft grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-white/80">
            +
          </button>
        </Tip>
        <Tip label="Frame all bubbles">
          <button
            onClick={() => frameAll(false)}
            className={`relative grid h-9 place-items-center rounded-full px-3.5 text-sm transition ${offscreen ? 'bg-lilac-500 text-white shadow-md shadow-lilac-500/40' : 'glass-soft text-ink-soft hover:bg-white/80'}`}
          >
            Frame all
            {offscreen && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-rose-soft" />}
          </button>
        </Tip>
      </div>
    </div>
  )
}
