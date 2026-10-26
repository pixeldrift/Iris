import { useEffect, useMemo, useRef, useState } from 'react'
import { drop } from '../../audio/engine'
import { filterTasks, bubbleRadius } from '../../core/tasks'
import type { Task, TaskKind } from '../../core/types'
import { useStore } from '../../state/store'
import { DoneButton, DueChip, KINDS } from '../shared'
import { useFloatDrag } from '../useFloatDrag'

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
  return {
    cls: (['drift-a', 'drift-b', 'drift-c'] as const)[h % 3],
    dur: 9 + (h % 8),
    delay: -(h % 13),
  }
}

function Lily({ task, W, H, containerRef }: { task: Task; W: number; H: number; containerRef: React.RefObject<HTMLElement | null> }) {
  const update = useStore((s) => s.updateTask)
  const scale = useStore((s) => s.settings.sizeByPriority)
  const drift = useStore((s) => s.settings.drift)
  const folders = useStore((s) => s.folders)
  const r = Math.round(bubbleRadius(task, scale) * Math.min(1, Math.max(0.72, W / 900)))
  const m = useMemo(() => motion(task.id), [task.id])
  const fresh = Date.now() - task.createdAt < 1500
  const hue = useMemo(() => {
    const f = folders.find((x) => x.id === task.folderIds[0])
    return f ? f.hue : task.kind === 'idea' ? 320 : task.kind === 'reminder' ? 200 : 285
  }, [folders, task.folderIds, task.kind])

  const { onPointerDown, dragging } = useFloatDrag(task, containerRef, { x: task.x, y: task.y }, (x, y) => update(task.id, { x, y }))
  const done = task.status === 'done'
  const font = Math.max(11, Math.min(15, r / 4.4))

  const style: React.CSSProperties = dragging
    ? { position: 'fixed', left: dragging.cx - r, top: dragging.cy - r, zIndex: 90 }
    : { position: 'absolute', left: task.x * W - r, top: task.y * H - r, transition: 'left .5s ease, top .5s ease' }

  return (
    <div style={{ ...style, width: r * 2, height: r * 2 }} className={fresh ? 'bloom-in' : ''}>
      <div
        className={drift && !dragging ? m.cls : ''}
        style={{ '--dur': `${m.dur}s`, '--delay': `${m.delay}s`, width: '100%', height: '100%' } as React.CSSProperties}
      >
        <div
          role="button"
          tabIndex={0}
          onPointerDown={(e) => onPointerDown(e, true)}
          onKeyDown={(e) => e.key === 'Enter' && useStore.getState().select(task.id)}
          className={`pad group relative flex h-full w-full cursor-grab touch-none select-none flex-col items-center justify-center rounded-full p-3 text-center outline-none transition-[opacity,transform,filter] duration-300 focus-visible:ring-2 focus-visible:ring-lilac-500 ${
            done ? 'opacity-55 saturate-50' : ''
          } ${dragging ? 'scale-110 cursor-grabbing' : 'hover:scale-[1.04]'}`}
          style={{ '--h': hue } as React.CSSProperties}
        >
          <span
            className={`line-clamp-3 break-words font-display leading-[1.15] ${done ? 'line-through decoration-lilac-300' : ''}`}
            style={{ fontSize: font }}
          >
            {task.title || 'Untitled'}
          </span>
          {r >= 56 && task.due && (
            <span className="mt-1 scale-90">
              <DueChip task={task} />
            </span>
          )}
          <span className="absolute -right-1 -top-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <DoneButton task={task} size={22} />
          </span>
          {task.kind !== 'task' && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-1.5 text-[0.6rem] uppercase tracking-wide text-lilac-600 shadow-sm">
              {task.kind}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function Pond() {
  const tasks = useStore((s) => s.tasks)
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  const showDone = useStore((s) => s.settings.showDone)
  const addTask = useStore((s) => s.addTask)
  const select = useStore((s) => s.select)

  const ref = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(ref)
  const visible = useMemo(() => filterTasks(tasks, scope, folders, showDone), [tasks, scope, folders, showDone])

  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<TaskKind>('task')
  const nextId = useRef(0)

  const commit = () => {
    if (bubble && text.trim()) {
      addTask({ title: text.trim(), kind, x: bubble.x / w, y: bubble.y / h })
    }
    setBubble(null)
    setText('')
  }

  const onBackground = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    select(null)
    if (bubble) commit()
    const id = nextId.current++
    setRipples((r) => [...r, { id, x, y }])
    window.setTimeout(() => setRipples((r) => r.filter((q) => q.id !== id)), 2800)
    drop((x / rect.width) * 2 - 1)
    setBubble({ x, y })
    setKind('task')
  }

  // keep the composer bubble on-screen
  const bw = Math.min(280, Math.max(200, w - 24))
  const bx = bubble ? Math.min(Math.max(bubble.x - bw / 2, 12), Math.max(12, w - bw - 12)) : 0
  const by = bubble ? Math.min(bubble.y + 14, Math.max(12, h - 112)) : 0

  return (
    <div
      ref={ref}
      onClick={onBackground}
      className="relative h-full w-full cursor-[crosshair] touch-manipulation overflow-hidden rounded-[2rem] border border-white/70 shadow-[0_20px_60px_-24px_rgba(107,68,145,0.35)]"
      style={{
        background:
          'radial-gradient(70% 60% at 30% 20%, rgba(255,255,255,0.75), transparent 70%), radial-gradient(60% 60% at 80% 90%, rgba(225,208,244,0.55), transparent 70%), linear-gradient(160deg, rgba(255,255,255,0.5), rgba(240,231,250,0.45))',
      }}
      aria-label="Pond canvas. Click anywhere to add a thought."
    >
      {w > 0 &&
        visible.map((t) => (
          <Lily key={t.id} task={t} W={w} H={h} containerRef={ref} />
        ))}

      {ripples.map((r) => (
        <span key={r.id}>
          {[0, 0.28, 0.6].map((d, i) => (
            <span
              key={i}
              className="ripple-ring"
              style={{ left: r.x, top: r.y, width: 240 + i * 90, height: 240 + i * 90, animationDelay: `${d}s`, opacity: 0 }}
            />
          ))}
        </span>
      ))}

      {bubble && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
          onClick={(e) => e.stopPropagation()}
          className="glass bloom-in absolute z-20 rounded-[1.6rem] p-2.5"
          style={{ left: bx, top: by, width: bw, transformOrigin: `${bubble.x - bx}px -10px` }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setText('')
                setBubble(null)
              }
            }}
            placeholder="A thought, task, reminder…"
            className="w-full bg-transparent px-2 py-1 font-display text-base outline-none placeholder:text-ink-faint"
          />
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
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-8 text-center font-display text-xl italic text-ink-faint">
          Touch the water to plant a thought
        </p>
      )}
      {visible.length > 0 && !bubble && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-ink-faint/80">
          Tap the water to add · drag a lily onto a folder to tag it
        </p>
      )}
    </div>
  )
}
