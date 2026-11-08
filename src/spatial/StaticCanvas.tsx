import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import type { SpatialContent } from './content'

/**
 * The simplest spatial canvas, with no WebGL: the same groups and tasks in the same order, laid out side by side on a canvas you can
 * pan and zoom. Selecting, opening and completing all work. This is where the workspace lands when 3D is unavailable (or switched off),
 * so it is a working view, not an error.
 */
export function StaticCanvas({ content }: { content: SpatialContent }) {
  const select = useStore((s) => s.select)
  const toggle = useStore((s) => s.toggleDone)
  const [v, setV] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const zoom = (f: number) => setV((s) => ({ ...s, k: Math.min(2.2, Math.max(0.4, s.k * f)) }))
  return (
    <div
      className="absolute inset-0 touch-none select-none overflow-hidden rounded-[inherit] bg-gradient-to-b from-lilac-100/60 to-white/30"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y }
      }}
      onPointerMove={(e) => drag.current && setV((s) => ({ ...s, x: drag.current!.vx + e.clientX - drag.current!.x, y: drag.current!.vy + e.clientY - drag.current!.y }))}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => zoom(Math.exp(-e.deltaY * 0.0015))}
      aria-label="Your tasks by group. Drag to move around."
    >
      <div className="flex items-start gap-5 p-8" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})`, transformOrigin: '0 0' }}>
        {content.clusters.map((c) => (
          <section key={c.id} className="w-56 shrink-0" style={{ marginTop: c.depth * 18 }} aria-label={c.name}>
            <h3 className="mb-2 flex items-center justify-between rounded-full px-3.5 py-1.5 font-display text-lg font-bold italic text-white shadow-md" style={{ background: `hsl(${Math.max(0, c.hue)},55%,56%)` }}>
              {c.name}
              <span className="rounded-full bg-white/90 px-2 text-xs not-italic" style={{ color: `hsl(${Math.max(0, c.hue)},45%,32%)` }}>
                {c.count}
              </span>
            </h3>
            <div className="space-y-2">
              {content.tasks
                .filter((t) => t.cluster === c.id)
                .map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-2xl border bg-white/85 px-2.5 py-2 shadow-sm" style={{ borderColor: `hsl(${Math.max(0, t.hue)},55%,76%)`, opacity: t.done ? 0.55 : 1 }}>
                    <button type="button" role="checkbox" aria-checked={t.done} aria-label={`${t.done ? 'Mark not done' : 'Mark done'}: ${t.title}`} onClick={() => toggle(t.id)} className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs text-white" style={{ borderColor: `hsl(${Math.max(0, t.hue)},55%,62%)`, background: t.done ? `hsl(${Math.max(0, t.hue)},60%,60%)` : 'transparent' }}>
                      {t.done ? '✓' : ''}
                    </button>
                    <button type="button" onClick={() => select(t.id)} className={`min-w-0 flex-1 text-left font-display text-sm leading-snug ${t.done ? 'line-through' : ''}`}>
                      {t.title || 'Untitled'}
                      {t.due && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[0.65rem] not-italic" style={{ background: `hsl(${Math.max(0, t.hue)},60%,88%)` }}>{t.due}</span>}
                    </button>
                  </div>
                ))}
            </div>
          </section>
        ))}
        {content.tasks.length === 0 && <p className="p-6 text-sm text-ink-faint">Nothing to show here yet.</p>}
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.2)} className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-lg shadow">
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)} className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-lg shadow">
          −
        </button>
      </div>
    </div>
  )
}
