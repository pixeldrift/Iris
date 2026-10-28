import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { satOf, tint } from '../../core/color'
import { stepSim, WATER_FEEL, type SimNode } from '../../core/flock'
import { bubbleRadius, clamp01 } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useFloatDrag } from '../useFloatDrag'
import { useLeaveClass, useVisibleTasks } from '../useVisible'

const QUADS = [
  { label: 'Tend now', sub: 'matters · pressing', cls: 'right-0 top-0 items-end justify-start text-right', hue: 345 },
  { label: 'Make time', sub: 'matters · can wait', cls: 'left-0 top-0 items-start justify-start', hue: 285 },
  { label: 'Quick breeze', sub: 'pressing · small', cls: 'bottom-0 right-0 items-end justify-end text-right', hue: 200 },
  { label: 'Let it drift', sub: 'neither, for now', cls: 'bottom-0 left-0 items-start justify-end', hue: 150 },
]

const CLAMP = { minX: 0, maxX: 1, minY: 0, maxY: 1 }

interface Api {
  field: React.RefObject<HTMLDivElement | null>
  register: (id: string, el: HTMLElement | null) => void
  frac: (id: string) => { x: number; y: number }
  grab: (id: string) => void
  drag: (id: string, fx: number, fy: number) => void
  release: (id: string) => void
}

/**
 * A bubble on the grid. Its real urgency and importance are a goal; where it is drawn is a
 * separate thing, settled by a little physics so bubbles with the same values sit around
 * their shared spot instead of on top of each other.
 */
const Bub = memo(function Bub({ task, r, hue, start, api }: { task: Task; r: number; hue: number; start: { x: number; y: number }; api: Api }) {
  const update = useStore((s) => s.updateTask)
  const leave = useLeaveClass(task)
  const el = useRef<HTMLDivElement>(null)
  // only the first position goes in the style; after that the physics owns the transform
  const first = useRef(start).current
  useEffect(() => {
    api.register(task.id, el.current)
    return () => api.register(task.id, null)
  }, [api, task.id])

  const { onPointerDown } = useFloatDrag(
    task,
    api.field,
    () => api.frac(task.id),
    // the real value is where you let go of it, not where it ended up being drawn
    (x, y) => update(task.id, { urgency: clamp01(x), importance: clamp01(1 - y) }),
    { clamp: CLAMP, onGrab: () => api.grab(task.id), onDrag: (fx, fy) => api.drag(task.id, fx, fy), onRelease: () => api.release(task.id) },
  )
  const done = task.status === 'done'
  return (
    <div ref={el} data-node className="absolute left-0 top-0 will-change-transform" style={{ width: r * 2, height: r * 2, transform: `translate(${first.x - r}px, ${first.y - r}px)` }}>
      <div className={`bloom-in h-full w-full ${leave}`}>
        <div
          role="button"
          tabIndex={0}
          onPointerDown={(e) => onPointerDown(e, true)}
          onKeyDown={(e) => e.key === 'Enter' && useStore.getState().select(task.id)}
          className={`pad grid h-full w-full cursor-grab touch-none select-none place-items-center rounded-full p-1.5 text-center outline-none transition-[opacity,transform] hover:scale-110 focus-visible:ring-2 focus-visible:ring-lilac-500 ${done ? 'opacity-50' : ''}`}
          style={{ '--h': Math.max(0, hue), '--s': satOf(hue) } as React.CSSProperties}
          title={task.title}
        >
          <span className="line-clamp-3 break-words font-display text-[0.7rem] leading-[1.1]">{task.title}</span>
        </div>
      </div>
    </div>
  )
})

/**
 * A soft, glowing dot: where a bubble's real urgency and importance actually are. Drag it to set the
 * values directly (continuously, no steps); it glides when they change any other way.
 */
function Glow({ x, y, hue, task, field }: { x: number; y: number; hue: number; task: Task; field: React.RefObject<HTMLDivElement | null> }) {
  const update = useStore((s) => s.updateTask)
  const [held, setHeld] = useState(false)

  const grab = (e: React.PointerEvent) => {
    e.stopPropagation()
    const el = field.current
    if (!el) return
    setHeld(true)
    document.body.classList.add('dragging')
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect()
      update(task.id, { urgency: clamp01((ev.clientX - r.left) / r.width), importance: clamp01(1 - (ev.clientY - r.top) / r.height) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.classList.remove('dragging')
      setHeld(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      // follows 1:1 while held; otherwise a short glide so it never jumps
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)', transition: held ? 'none' : 'left .22s ease-out, top .22s ease-out' }}
    >
      <div
        className="glow-breathe h-14 w-14 rounded-full"
        style={{ background: `radial-gradient(circle, ${tint(hue, 85, 62, 0.95)} 0%, ${tint(hue, 85, 66, 0.5)} 28%, ${tint(hue, 85, 70, 0.18)} 55%, transparent 72%)`, filter: 'blur(2.5px)' }}
      />
      <div
        onPointerDown={grab}
        title="Drag to set the real value"
        className="pointer-events-auto absolute left-1/2 top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full active:cursor-grabbing"
      >
        <span className="h-2 w-2 rounded-full" style={{ background: `${tint(hue, 80, 55)}`, boxShadow: `0 0 10px 3px ${tint(hue, 85, 60, 0.8)}` }} />
      </div>
    </div>
  )
}

export function Priority() {
  const field = useRef<HTMLDivElement>(null)
  const visible = useVisibleTasks()
  const folders = useStore((s) => s.folders)
  const selectedId = useStore((s) => s.selectedId)

  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = field.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  const dims = useRef(size)
  dims.current = size

  const nodes = useRef(new Map<string, SimNode>())
  const els = useRef(new Map<string, HTMLElement>())
  const raf = useRef(0)
  const running = useRef(false)
  const grabbed = useRef(0)
  const [dragFrac, setDragFrac] = useState<{ id: string; x: number; y: number } | null>(null)

  const radius = (t: Task) => Math.round(bubbleRadius(t, true) * 0.62)
  const hueOf = useCallback((t: Task) => folders.find((f) => f.id === t.folderIds[0])?.hue ?? 285, [folders])

  const paint = useCallback(() => {
    for (const n of nodes.current.values()) {
      const e = els.current.get(n.id)
      if (e) e.style.transform = `translate(${n.x - n.r}px, ${n.y - n.r}px)`
    }
  }, [])

  const wake = useCallback(() => {
    if (running.current) return
    running.current = true
    const tick = () => {
      const { w, h } = dims.current
      const list = [...nodes.current.values()]
      const { energy } = stepSim(list, { home: 0.013, magnet: 0, damping: WATER_FEEL.damping, push: WATER_FEEL.push }, () => false)
      for (const n of list) {
        // stay on the grid
        n.x = Math.min(w - n.r, Math.max(n.r, n.x))
        n.y = Math.min(h - n.r, Math.max(n.r, n.y))
      }
      paint()
      if (list.length && (energy > 0.02 || grabbed.current > 0)) raf.current = requestAnimationFrame(tick)
      else running.current = false
    }
    raf.current = requestAnimationFrame(tick)
  }, [paint])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // goals (home) come from the real values; the drawn position is whatever physics settles on
  useEffect(() => {
    const { w, h } = size
    if (!w || !h) return
    const ids = new Set(visible.map((t) => t.id))
    for (const id of [...nodes.current.keys()]) if (!ids.has(id)) nodes.current.delete(id)
    for (const t of visible) {
      const hx = t.urgency * w
      const hy = (1 - t.importance) * h
      const r = radius(t)
      const n = nodes.current.get(t.id)
      if (n) {
        n.hx = hx
        n.hy = hy
        n.r = r
      } else nodes.current.set(t.id, { id: t.id, x: hx, y: hy, vx: 0, vy: 0, hx, hy, r, pinned: false })
    }
    paint()
    wake()
  }, [visible, size, paint, wake]) // eslint-disable-line react-hooks/exhaustive-deps

  const api: Api = useMemo(
    () => ({
      field,
      register: (id, el) => {
        if (el) els.current.set(id, el)
        else els.current.delete(id)
      },
      frac: (id) => {
        const n = nodes.current.get(id)
        const { w, h } = dims.current
        return n && w && h ? { x: n.x / w, y: n.y / h } : { x: 0.5, y: 0.5 }
      },
      grab: (id) => {
        const n = nodes.current.get(id)
        if (n) n.pinned = true
        grabbed.current += 1
        wake()
      },
      drag: (id, fx, fy) => {
        const n = nodes.current.get(id)
        const { w, h } = dims.current
        if (!n) return
        n.x = fx * w
        n.y = fy * h
        setDragFrac({ id, x: clamp01(fx), y: clamp01(fy) })
        wake()
      },
      release: (id) => {
        const n = nodes.current.get(id)
        if (n) n.pinned = false
        grabbed.current = Math.max(0, grabbed.current - 1)
        setDragFrac(null)
        wake()
      },
    }),
    [wake],
  )

  // the glow marks the real value of the bubble being dragged, or the one you've opened
  const glowTask = visible.find((t) => t.id === (dragFrac?.id ?? selectedId))
  const glowAt = glowTask && size.w ? (dragFrac ? { x: dragFrac.x * size.w, y: dragFrac.y * size.h } : { x: glowTask.urgency * size.w, y: (1 - glowTask.importance) * size.h }) : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="hidden w-5 shrink-0 items-center justify-center md:flex">
          <span className="-rotate-90 whitespace-nowrap text-xs tracking-wide text-ink-faint">matters less → matters more</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="glass relative min-h-0 flex-1 rounded-[2rem]" style={{ padding: 0 }}>
            <div ref={field} className="absolute inset-[34px] md:inset-[40px]">
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-white/20 shadow-[inset_0_0_30px_rgb(var(--lr-300)/0.35)]" />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-lilac-300/50" />
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-lilac-300/50" />
              {QUADS.map((q) => (
                <div key={q.label} className={`pointer-events-none absolute flex h-1/2 w-1/2 flex-col p-3 ${q.cls}`}>
                  <span className="font-display text-base italic" style={{ color: `${tint(q.hue, 35, 45)}`, opacity: 0.75 }}>
                    {q.label}
                  </span>
                  <span className="text-[0.65rem] text-ink-faint">{q.sub}</span>
                </div>
              ))}
              {size.w > 0 && visible.map((t) => <Bub key={t.id} task={t} r={radius(t)} hue={hueOf(t)} start={{ x: t.urgency * size.w, y: (1 - t.importance) * size.h }} api={api} />)}
              {glowTask && glowAt && <Glow x={glowAt.x} y={glowAt.y} hue={hueOf(glowTask)} task={glowTask} field={field} />}
            </div>
          </div>
          <p className="py-1.5 text-center text-xs tracking-wide text-ink-faint">less pressing → more pressing</p>
        </div>
      </div>
    </div>
  )
}
