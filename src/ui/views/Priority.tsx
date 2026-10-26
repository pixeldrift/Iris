import { useMemo, useRef } from 'react'
import { clamp01, bubbleRadius, filterTasks } from '../../core/tasks'
import type { Task } from '../../core/types'
import { useStore } from '../../state/store'
import { useFloatDrag } from '../useFloatDrag'

const QUADS = [
  { label: 'Tend now', sub: 'matters · pressing', cls: 'right-0 top-0 items-end justify-start text-right', hue: 345 },
  { label: 'Make time', sub: 'matters · can wait', cls: 'left-0 top-0 items-start justify-start', hue: 285 },
  { label: 'Quick breeze', sub: 'pressing · small', cls: 'bottom-0 right-0 items-end justify-end text-right', hue: 200 },
  { label: 'Let it drift', sub: 'neither, for now', cls: 'bottom-0 left-0 items-start justify-end', hue: 150 },
]

function Dot({ task, containerRef }: { task: Task; containerRef: React.RefObject<HTMLElement | null> }) {
  const update = useStore((s) => s.updateTask)
  const folders = useStore((s) => s.folders)
  const hue = folders.find((f) => f.id === task.folderIds[0])?.hue ?? 285
  const r = Math.round(bubbleRadius(task, true) * 0.62)
  const frac = { x: task.urgency, y: 1 - task.importance }
  const { onPointerDown, dragging } = useFloatDrag(task, containerRef, frac, (x, y) =>
    update(task.id, { urgency: clamp01(x), importance: clamp01(1 - y) }),
  )
  const done = task.status === 'done'
  const style: React.CSSProperties = dragging
    ? { position: 'fixed', left: dragging.cx, top: dragging.cy, zIndex: 90 }
    : { position: 'absolute', left: `${frac.x * 100}%`, top: `${frac.y * 100}%`, transition: 'left .4s ease, top .4s ease' }
  return (
    <div style={{ ...style, transform: 'translate(-50%, -50%)' }}>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => onPointerDown(e, true)}
        onKeyDown={(e) => e.key === 'Enter' && useStore.getState().select(task.id)}
        className={`pad grid cursor-grab touch-none select-none place-items-center rounded-full p-1.5 text-center outline-none transition hover:z-10 hover:scale-110 focus-visible:ring-2 focus-visible:ring-lilac-500 ${done ? 'opacity-50' : ''}`}
        style={{ width: r * 2, height: r * 2, '--h': hue } as React.CSSProperties}
        title={task.title}
      >
        <span className="line-clamp-3 break-words font-display text-[0.7rem] leading-[1.1]">{task.title}</span>
      </div>
    </div>
  )
}

export function Priority() {
  const tasks = useStore((s) => s.tasks)
  const folders = useStore((s) => s.folders)
  const scope = useStore((s) => s.scope)
  const showDone = useStore((s) => s.settings.showDone)
  const ref = useRef<HTMLDivElement>(null)
  const visible = useMemo(() => filterTasks(tasks, scope, folders, showDone), [tasks, scope, folders, showDone])

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="hidden w-5 shrink-0 items-center justify-center md:flex">
          <span className="-rotate-90 whitespace-nowrap text-xs tracking-wide text-ink-faint">matters less → matters more</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="glass relative min-h-0 flex-1 rounded-[2rem]"
            style={{ padding: 0 }}
          >
            <div ref={ref} className="absolute inset-[34px] md:inset-[40px]">
              <div className="pointer-events-none absolute inset-0 rounded-3xl border border-dashed border-lilac-300/60" />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-lilac-300/50" />
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-lilac-300/50" />
              {QUADS.map((q) => (
                <div key={q.label} className={`pointer-events-none absolute flex h-1/2 w-1/2 flex-col p-3 ${q.cls}`}>
                  <span className="font-display text-base italic" style={{ color: `hsl(${q.hue},35%,45%)`, opacity: 0.75 }}>
                    {q.label}
                  </span>
                  <span className="text-[0.65rem] text-ink-faint">{q.sub}</span>
                </div>
              ))}
              {visible.map((t) => (
                <Dot key={t.id} task={t} containerRef={ref} />
              ))}
            </div>
          </div>
          <p className="py-1.5 text-center text-xs tracking-wide text-ink-faint">less pressing → more pressing</p>
        </div>
      </div>
    </div>
  )
}
