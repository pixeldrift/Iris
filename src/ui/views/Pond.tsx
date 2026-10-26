import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { drop } from '../../audio/engine'
import { boundsOf, fitView, stepSim, type SimNode } from '../../core/flock'
import { groupTasks, layoutClusters, pairKey, relations } from '../../core/groups'
import { contactLink, detectContactIntent } from '../../core/people'
import { bubbleRadius } from '../../core/tasks'
import type { Task, TaskKind } from '../../core/types'
import { useStore } from '../../state/store'
import { IconClose } from '../icons'
import { DoneButton, DueChip, KINDS } from '../shared'
import { Tip } from '../Tip'
import { useFloatDrag } from '../useFloatDrag'
import { useLeaveClass, useVisibleTasks } from '../useVisible'

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
  release: (id: string) => void
}

const Lily = memo(function Lily({ task, r, api, start }: { task: Task; r: number; api: PondApi; start: { x: number; y: number } }) {
  const update = useStore((s) => s.updateTask)
  const drift = useStore((s) => s.settings.drift)
  const folders = useStore((s) => s.folders)
  const person = useStore((s) => s.people.find((p) => task.personIds.includes(p.id) && (p.phone || p.email)))
  const leave = useLeaveClass(task)
  const m = useMemo(() => motion(task.id), [task.id])
  const fresh = useRef(Date.now() - task.createdAt < 1500).current
  const hue = useMemo(() => {
    const f = folders.find((x) => x.id === task.folderIds[0])
    return f ? f.hue : task.kind === 'idea' ? 320 : task.kind === 'reminder' ? 200 : 285
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
    (x, y) => update(task.id, { x, y }),
    {
      toClient,
      fromClient,
      clamp: { minX: -3, maxX: 4, minY: -3, maxY: 4 },
      onGrab: () => api.grab(task.id),
      onDrag: (fx, fy) => api.drag(task.id, fx, fy),
      onRelease: () => api.release(task.id),
    },
  )

  const done = task.status === 'done'
  const font = Math.max(11, Math.min(15, r / 4.4))
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
              className={`pad group relative flex h-full w-full cursor-grab touch-none select-none flex-col items-center justify-center rounded-full p-3 text-center outline-none transition-[opacity,transform,filter] duration-300 hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-lilac-500 ${
                done ? 'opacity-55 saturate-50' : ''
              }`}
              style={{ '--h': hue } as React.CSSProperties}
            >
              <span className={`line-clamp-3 break-words font-display leading-[1.15] ${done ? 'line-through decoration-lilac-300' : ''}`} style={{ fontSize: font }}>
                {task.title || 'Untitled'}
              </span>
              {r >= 52 && task.due && (
                <span className="mt-1 scale-90">
                  <DueChip task={task} />
                </span>
              )}
              <span className="absolute -right-1 -top-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <DoneButton task={task} size={22} />
              </span>
              {link && (
                <a
                  href={link.href}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="pop-in absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-lilac-500 px-2.5 py-0.5 text-[0.68rem] font-medium text-white shadow-md shadow-lilac-500/40 transition hover:bg-lilac-600"
                >
                  {link.label} {person!.name.split(' ')[0]}
                </a>
              )}
              {!link && task.kind !== 'task' && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-1.5 text-[0.6rem] uppercase tracking-wide text-lilac-600 shadow-sm">
                  {task.kind}
                </span>
              )}
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
  const visible = useVisibleTasks()
  const folders = useStore((s) => s.folders)
  const people = useStore((s) => s.people)
  const scale = useStore((s) => s.settings.sizeByPriority)
  const group = useStore((s) => s.settings.pondGroup)
  const magnet = useStore((s) => s.settings.magnet)
  const addTask = useStore((s) => s.addTask)
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
  const lineEls = useRef(new Map<string, SVGLineElement>())
  const [offscreen, setOffscreen] = useState(false)
  const [labels, setLabels] = useState<{ key: string; label: string; x: number; y: number }[]>([])
  const labelsRef = useRef(labels)

  const rf = Math.min(1, Math.max(0.72, w / 900))
  const radius = useCallback((t: Task) => Math.round(bubbleRadius(t, scale) * rf), [scale, rf])
  const rel = useMemo(() => relations(visible), [visible])

  const live = useRef({ rel, group, magnet })
  live.current = { rel, group, magnet }

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
    const { links } = live.current.rel
    for (const [a, b] of links) {
      const el = lineEls.current.get(pairKey(a, b))
      const na = nodes.current.get(a)
      const nb = nodes.current.get(b)
      if (el && na && nb) {
        el.setAttribute('x1', String(na.sim.x))
        el.setAttribute('y1', String(na.sim.y))
        el.setAttribute('x2', String(nb.sim.x))
        el.setAttribute('y2', String(nb.sim.y))
      }
    }
  }, [])

  const wake = useCallback(() => {
    if (running.current) return
    running.current = true
    const tick = () => {
      const { rel: r, group: g, magnet: mg } = live.current
      const list = [...nodes.current.values()].map((n) => n.sim)
      const { bumps, energy } = stepSim(
        list,
        { home: g === 'free' ? 0.002 : 0.012, magnet: g === 'free' && mg ? 0.1 : 0, damping: 0.88 },
        (a, b) => r.related.has(pairKey(a, b)),
      )
      paint()
      const now = performance.now()
      for (const bump of bumps) {
        const n = nodes.current.get(bump.id)
        const jig = els.current.get(bump.id)?.jig
        if (n && jig && bump.strength > 1.1 && now - n.bumped > 450) {
          n.bumped = now
          jig.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.07, 0.94)' }, { transform: 'scale(0.97, 1.03)' }, { transform: 'scale(1)' }],
            { duration: 420, easing: 'ease-out' },
          )
        }
      }
      if (nodes.current.size && (energy > 0.02 || grabbed.current > 0)) raf.current = requestAnimationFrame(tick)
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
    if (group === 'free') {
      for (const t of visible) homes.set(t.id, { x: t.x * w, y: t.y * h })
    } else {
      const groups = groupTasks(visible, group, folders, people)
      const avgR = visible.length ? visible.reduce((s, t) => s + radius(t), 0) / visible.length : 50
      const spacing = avgR * 1.45
      const blob = (n: number) => spacing * Math.sqrt(n) + avgR
      // clusters sit far enough apart never to touch; "Frame all" then zooms to fit
      const centers = layoutClusters(groups.map((g) => blob(g.taskIds.length)), w / h)
      groups.forEach((g, gi) => {
        const cx = w / 2 + centers[gi].x
        const cy = h / 2 + centers[gi].y
        g.taskIds.forEach((id, i) => {
          const a = i * 2.39996
          const rad = spacing * Math.sqrt(i)
          homes.set(id, { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad })
        })
        nextLabels.push({ key: g.key, label: g.label, x: cx, y: cy - (blob(g.taskIds.length) + 22) })
      })
    }
    setLabels(nextLabels)
    labelsRef.current = nextLabels

    const map = nodes.current
    const ids = new Set(visible.map((t) => t.id))
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id)
    for (const t of visible) {
      const home = homes.get(t.id)!
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
      grab: (id) => {
        const n = nodes.current.get(id)
        if (n) n.sim.pinned = true
        grabbed.current += 1
        wake()
      },
      drag: (id, fx, fy) => {
        const n = nodes.current.get(id)
        if (!n) return
        n.sim.x = fx * dims.current.w
        n.sim.y = fy * dims.current.h
      },
      release: (id) => {
        const n = nodes.current.get(id)
        if (n) n.sim.pinned = false
        grabbed.current = Math.max(0, grabbed.current - 1)
        wake()
      },
    }),
    [wake],
  )

  /* ---------- pan / pinch / tap-to-add ---------- */
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<TaskKind>('task')
  const nextId = useRef(0)
  const bubbleRef = useRef(bubble)
  bubbleRef.current = bubble
  const textRef = useRef(text)
  textRef.current = text
  const kindRef = useRef(kind)
  kindRef.current = kind

  const closeBubble = useCallback(
    (save: boolean) => {
      const b = bubbleRef.current
      if (b && save && textRef.current.trim()) {
        const v = view.current
        const { w: W, h: H } = dims.current
        addTask({ title: textRef.current.trim(), kind: kindRef.current, x: (b.x - v.tx) / v.scale / W, y: (b.y - v.ty) / v.scale / H })
      }
      setBubble(null)
      setText('')
    },
    [addTask],
  )

  const openBubble = (x: number, y: number) => {
    const id = nextId.current++
    setRipples((r) => [...r, { id, x, y }])
    window.setTimeout(() => setRipples((r) => r.filter((q) => q.id !== id)), 2800)
    drop((x / dims.current.w) * 2 - 1)
    setBubble({ x, y })
    setKind('task')
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ptrs = new Map<number, { x: number; y: number }>()
    let mode: 'none' | 'tap' | 'pan' | 'pinch' = 'none'
    let openAtDown = false
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
      if (mode === 'tap' && Math.hypot(dx, dy) > 6) mode = 'pan'
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
          if (openAtDown) closeBubble(true)
          else openBubble(p.x, p.y)
        }
        mode = 'none'
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
        openAtDown = !!bubbleRef.current
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
      if (e.ctrlKey || e.metaKey) zoomAbout(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      else {
        const v = view.current
        view.current = { ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }
        applyView()
      }
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
  }, [applyView, zoomAbout, closeBubble, select, checkOffscreen]) // eslint-disable-line react-hooks/exhaustive-deps

  // keep the composer on-screen
  const bw = Math.min(280, Math.max(200, w - 24))
  const bx = bubble ? Math.min(Math.max(bubble.x - bw / 2, 12), Math.max(12, w - bw - 12)) : 0
  const by = bubble ? Math.min(bubble.y + 14, Math.max(12, h - 124)) : 0

  const showLines = group === 'free' && magnet

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
        <svg className={`pointer-events-none absolute left-0 top-0 overflow-visible transition-opacity duration-700 ${showLines ? 'opacity-100' : 'opacity-0'}`} width={w} height={h}>
          {rel.links.map(([a, b]) => (
            <line
              key={pairKey(a, b)}
              ref={(el) => {
                const k = pairKey(a, b)
                if (el) lineEls.current.set(k, el)
                else lineEls.current.delete(k)
              }}
              stroke="rgba(159,111,205,0.45)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="1 7"
            />
          ))}
        </svg>

        {labels.map((l) => (
          <div
            key={l.key}
            className="pop-in pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display text-lg italic text-lilac-700/80"
            style={{ left: l.x, top: l.y }}
          >
            {l.label}
          </div>
        ))}

        {w > 0 &&
          visible.map((t) => <Lily key={t.id} task={t} r={radius(t)} api={api} start={{ x: t.x * w, y: t.y * h }} />)}
      </div>

      {ripples.map((r) => (
        <span key={r.id}>
          {[0, 0.28, 0.6].map((d, i) => (
            <span key={i} className="ripple-ring" style={{ left: r.x, top: r.y, width: 240 + i * 90, height: 240 + i * 90, animationDelay: `${d}s`, opacity: 0 }} />
          ))}
        </span>
      ))}

      {bubble && (
        <form
          data-ui
          onSubmit={(e) => {
            e.preventDefault()
            closeBubble(true)
          }}
          onBlur={(e) => {
            // tapping anywhere outside the box tucks it away (keeping what was typed)
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeBubble(true)
          }}
          className="glass glass-strong pop-in absolute z-20 rounded-[1.6rem] p-2.5"
          style={{ left: bx, top: by, width: bw, ['--ox' as string]: `${bubble.x - bx}px`, ['--oy' as string]: '-10px' }}
        >
          <div className="flex items-center">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && closeBubble(false)}
              placeholder="A thought, task, reminder…"
              className="min-w-0 flex-1 bg-transparent px-2 py-1 font-display text-base outline-none placeholder:text-ink-faint"
            />
            <Tip label="Close">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => closeBubble(false)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-ink"
              >
                <IconClose size={14} />
              </button>
            </Tip>
          </div>
          <div className="mt-1.5 flex gap-1 px-1">
            {KINDS.map((k) => (
              <button
                type="button"
                key={k.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setKind(k.id)}
                className={`rounded-full px-2.5 py-0.5 text-[0.7rem] transition ${kind === k.id ? 'bg-lilac-500 text-white' : 'bg-white/60 text-ink-soft hover:bg-white'}`}
              >
                {k.label}
              </button>
            ))}
            <span className="ml-auto self-center text-[0.65rem] text-ink-faint">↵ to float</span>
          </div>
        </form>
      )}

      {visible.length === 0 && !bubble && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-8 text-center font-display text-xl italic text-ink-faint">Touch the water to plant a thought</p>
      )}
      {visible.length > 0 && !bubble && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 hidden pl-5 pr-60 text-left text-xs text-ink-faint/80 sm:block">Tap the water to add · drag to wander · pinch to zoom · drop a lily on a folder to tag it</p>
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
