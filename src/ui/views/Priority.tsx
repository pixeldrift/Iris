import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { satOf, tint } from '../../core/color'
import { stepSim, WATER_FEEL, type SimNode } from '../../core/flock'
import { clamp01, weightOf } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useFloatDrag } from '../useFloatDrag'
import { ZoomControl } from '../ZoomControl'
import { useLeaveClass, useVisibleTasks } from '../useVisible'

const QUADS = [
  { label: 'Tend now', sub: 'urgent & important', cls: '', edge: 'right-3 top-2 items-end text-right md:right-4 md:top-2.5', hue: 345 },
  { label: 'Make time', sub: 'not urgent, but important', cls: '', edge: 'left-3 top-2 items-start md:left-4 md:top-2.5', hue: 285 },
  { label: 'Knock it out', sub: 'urgent but unimportant', cls: '', edge: 'bottom-2 right-3 items-end text-right md:bottom-2.5 md:right-4', hue: 200 },
  { label: 'Whenever', sub: 'unimportant, not urgent', cls: '', edge: 'bottom-2 left-3 items-start md:bottom-2.5 md:left-4', hue: 150 },
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
    <div ref={el} data-node className="absolute left-0 top-0 will-change-transform" style={{ width: r * 2, height: r * 2, transform: `translate(${first.x - r}px, ${first.y - r}px)`, ['--r' as string]: r }}>
      <div className={`bloom-in h-full w-full ${leave}`}>
        <div
          role="button"
          tabIndex={0}
          onPointerDown={(e) => onPointerDown(e, true)}
          onKeyDown={(e) => e.key === 'Enter' && useStore.getState().select(task.id)}
          className={`pad grid h-full w-full cursor-grab touch-none select-none place-items-center rounded-full text-center outline-none transition-[opacity,transform] hover:scale-110 focus-visible:ring-2 focus-visible:ring-lilac-500 ${done ? 'opacity-50' : ''}`}
          style={{ '--h': Math.max(0, hue), '--s': satOf(hue), '--u': task.urgency, padding: 'calc(var(--r) * 0.14 * 1px)' } as React.CSSProperties}
          title={task.title}
        >
          {r >= 14 && (
            <span className="line-clamp-3 break-words font-display leading-[1.1]" style={{ fontSize: 'calc(var(--r) * 0.26 * 1px)', textShadow: '0 0 3px rgba(255,255,255,0.95), 0 0 7px rgba(255,255,255,0.7)' }}>
              {task.title}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

/**
 * A soft, glowing dot: where a bubble's real urgency and importance actually are. Drag it to set the
 * values directly (continuously, no steps); it glides when they change any other way.
 */
function Glow({ x, y, hue, task, field, live, glowRef }: { x: number; y: number; hue: number; task: Task; field: React.RefObject<HTMLDivElement | null>; live: boolean; glowRef: React.RefObject<HTMLDivElement | null> }) {
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
      ref={glowRef}
      className="pointer-events-none absolute left-0 top-0"
      // follows 1:1 while held (or while its bubble is carried, when the position is written straight to the page); otherwise a short glide so it never jumps
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)', transition: held || live ? 'none' : 'left .22s ease-out, top .22s ease-out' }}
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
  // which bubble is being carried (state once, on grab and release; its glow is then moved directly, with no re-render per pointer move)
  const [dragFrac, setDragFrac] = useState<{ id: string; x: number; y: number } | null>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const axisX = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const labelEls = useRef<Record<string, HTMLElement | null>>({})
  const hueRef = useRef<(t: Task) => number>(() => 285)
  const axisY = useRef<HTMLDivElement>(null)

  const scale = useStore((s) => s.settings.priorityScale)
  const setSetting = useStore((s) => s.setSetting)
  // size follows importance (and a little urgency), here and while a bubble is carried across the grid
  const radiusFor = (w: number) => Math.max(8, Math.round((44 + w * 44) * 0.62 * scale))
  const radius = (t: Task) => radiusFor(weightOf(t))
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const hueOf = useCallback((t: Task) => folders.find((f) => f.id === t.folderIds[0])?.hue ?? 285, [folders])
  hueRef.current = hueOf

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
        n.x = Math.min(w, Math.max(0, n.x))
        n.y = Math.min(h, Math.max(0, n.y))
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
        // a bubble being carried keeps chasing the finger, not its saved value
        if (!n.heavy) {
          n.hx = hx
          n.hy = hy
        }
        n.r = r
      } else nodes.current.set(t.id, { id: t.id, x: hx, y: hy, vx: 0, vy: 0, hx, hy, r, pinned: false })
    }
    paint()
    wake()
  }, [visible, size, scale, paint, wake]) // eslint-disable-line react-hooks/exhaustive-deps

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
        const { w, h } = dims.current
        if (n) {
          // the bubble is not held in place: it chases the finger as firmly as collisions allow
          n.heavy = true
          n.homeK = 0.2
          n.hx = n.x
          n.hy = n.y
          if (w && h) setDragFrac({ id, x: clamp01(n.x / w), y: clamp01(n.y / h) })
          const t = useStore.getState().tasks.find((x) => x.id === id)
          if (t) card.current?.style.setProperty('--dragc', tint(hueRef.current(t), 70, 42))
        }
        grabbed.current += 1
        wake()
      },
      drag: (id, fx, fy) => {
        const n = nodes.current.get(id)
        const { w, h } = dims.current
        if (!n || !w || !h) return
        // growing as it is dragged toward "important", deeper in colour toward "urgent"
        const u = clamp01(fx)
        const r = Math.max(8, Math.round((44 + weightOf({ importance: clamp01(1 - fy), urgency: u }) * 44) * 0.62 * scaleRef.current))
        n.r = r
        const el = els.current.get(id)
        if (el) {
          el.style.width = `${r * 2}px`
          el.style.height = `${r * 2}px`
          el.style.setProperty('--r', String(r))
          el.querySelector<HTMLElement>('.pad')?.style.setProperty('--u', String(u))
        }
        n.hx = Math.min(w, Math.max(0, fx * w))
        n.hy = Math.min(h, Math.max(0, fy * h))
        // the glow is the finger's own spot (the real value), so it never lags or jitters
        const g = glowRef.current
        const gx = clamp01(fx) * w
        const gy = clamp01(fy) * h
        if (g) {
          g.style.left = `${gx}px`
          g.style.top = `${gy}px`
        }
        // each axis label takes on the bubble's color the closer it is carried to that end
        const k = { important: clamp01((0.5 - fy) * 2), unimportant: clamp01((fy - 0.5) * 2), urgent: clamp01((fx - 0.5) * 2), noturgent: clamp01((0.5 - fx) * 2) }
        for (const [name, v] of Object.entries(k)) labelEls.current[name]?.style.setProperty('--k', String(v))
        // the same values, read off both axes
        if (axisX.current) axisX.current.style.left = `${gx}px`
        if (axisY.current) axisY.current.style.top = `${gy}px`
        wake()
      },
      release: (id) => {
        const n = nodes.current.get(id)
        const t = useStore.getState().tasks.find((x) => x.id === id)
        const { w, h } = dims.current
        if (n) {
          n.heavy = false
          n.homeK = undefined
          // back to its real value (the store has just been updated if it was dropped on the grid)
          if (t) {
            n.hx = t.urgency * w
            n.hy = (1 - t.importance) * h
          }
        }
        grabbed.current = Math.max(0, grabbed.current - 1)
        // the labels fade back to neutral
        for (const el of Object.values(labelEls.current)) el?.style.setProperty('--k', '0')
        setDragFrac(null)
        wake()
      },
    }),
    [wake],
  )

  // the glow marks the real value of the bubble being dragged, or the one you've opened
  const glowTask = visible.find((t) => t.id === (dragFrac?.id ?? selectedId))
  const glowAt = glowTask && size.w ? (dragFrac ? { x: dragFrac.x * size.w, y: dragFrac.y * size.h } : { x: glowTask.urgency * size.w, y: (1 - glowTask.importance) * size.h }) : null

  const axis = 'pointer-events-none absolute text-xs tracking-wide transition-colors duration-200'
  const axisStyle = { color: 'color-mix(in srgb, var(--dragc, var(--color-ink-faint)) calc(var(--k, 0) * 100%), var(--color-ink-faint))' } as React.CSSProperties
  // zoom here is the size of the bubbles; the grid stays put
  const zoomBubbles = (f: number) => setSetting('priorityScale', Math.min(1.6, Math.max(0.3, useStore.getState().settings.priorityScale * f)))

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={card} className="glass relative min-h-0 w-full flex-1 rounded-[2rem]" style={{ padding: 0 }}>
          {/* the four corner names sit outside the grid, so no bubble can cover them */}
          {QUADS.map((q) => (
            <div key={q.label} className={`pointer-events-none absolute flex flex-col ${q.edge}`}>
              <span className="font-display text-base italic leading-none" style={{ color: `${tint(q.hue, 35, 45)}`, opacity: 0.8 }}>
                {q.label}
              </span>
              <span className="mt-0.5 text-[0.65rem] leading-none text-ink-faint">{q.sub}</span>
            </div>
          ))}
          <div ref={field} className="absolute inset-x-2.5 bottom-[42px] top-[42px] md:inset-x-3.5">
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-white/20 shadow-[inset_0_0_30px_rgb(var(--lr-300)/0.35)]" />
            {/* the axis names sit just inside the grid, so the card needs no side margin for them */}
            <span
              className={`${axis} left-1/2 top-1.5 -translate-x-1/2`}
              ref={(el) => {
                labelEls.current.important = el
              }}
              style={axisStyle}
            >
              Important
            </span>
            <span
              className={`${axis} bottom-1.5 left-1/2 -translate-x-1/2`}
              ref={(el) => {
                labelEls.current.unimportant = el
              }}
              style={axisStyle}
            >
              Unimportant
            </span>
            <span
              className={`${axis} left-1.5 top-1/2 -translate-y-1/2 rotate-180 [writing-mode:vertical-rl]`}
              ref={(el) => {
                labelEls.current.noturgent = el
              }}
              style={axisStyle}
            >
              Not urgent
            </span>
            <span
              className={`${axis} right-1.5 top-1/2 -translate-y-1/2 [writing-mode:vertical-rl]`}
              ref={(el) => {
                labelEls.current.urgent = el
              }}
              style={axisStyle}
            >
              Urgent
            </span>
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px" style={{ background: 'linear-gradient(180deg, transparent, rgb(var(--lr-300) / 0.5) 16%, rgb(var(--lr-300) / 0.5) 84%, transparent)' }} />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--lr-300) / 0.5) 16%, rgb(var(--lr-300) / 0.5) 84%, transparent)' }} />
            {/* under the bubbles, so a carried bubble's title stays readable */}
            {glowTask && glowAt && <Glow x={glowAt.x} y={glowAt.y} hue={hueOf(glowTask)} task={glowTask} field={field} live={!!dragFrac} glowRef={glowRef} />}
            {size.w > 0 && visible.map((t) => <Bub key={t.id} task={t} r={radius(t)} hue={hueOf(t)} start={{ x: t.urgency * size.w, y: (1 - t.importance) * size.h }} api={api} />)}
            {dragFrac && glowTask && size.w > 0 && (
              <>
                <div ref={axisX} aria-hidden className="pointer-events-none absolute z-10 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ opacity: 0.25, left: dragFrac.x * size.w, top: size.h / 2, background: tint(hueOf(glowTask), 80, 55), boxShadow: `0 0 4px 1px ${tint(hueOf(glowTask), 85, 60, 0.7)}` }} />
                <div ref={axisY} aria-hidden className="pointer-events-none absolute z-10 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ opacity: 0.25, left: size.w / 2, top: dragFrac.y * size.h, background: tint(hueOf(glowTask), 80, 55), boxShadow: `0 0 4px 1px ${tint(hueOf(glowTask), 85, 60, 0.7)}` }} />
              </>
            )}
          </div>
        </div>
      </div>
      <div data-ui className="flex justify-end px-2 pt-2">
        <ZoomControl onZoom={zoomBubbles} />
      </div>
    </div>
  )
}
