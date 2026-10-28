import { useRef } from 'react'
import { IconZoom } from './icons'
import { Tip } from './Tip'

const STEP = 1.35
const MOVED = 6

/**
 * Two magnifying glasses, - and +. A tap steps the zoom; holding and dragging on either one scrubs it
 * continuously: up or right zooms in, down or left zooms out.
 */
export function ZoomControl({ onZoom, className = '' }: { onZoom: (factor: number) => void; className?: string }) {
  const drag = useRef<{ x: number; y: number; lx: number; ly: number; moved: boolean } | null>(null)

  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false }
  }
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < MOVED) return
    d.moved = true
    // up and right are "more": every pixel travelled is a small, steady slice of zoom
    const step = e.clientX - d.lx - (e.clientY - d.ly)
    d.lx = e.clientX
    d.ly = e.clientY
    if (step) onZoom(Math.exp(step * 0.012))
  }
  const up = (factor: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (d && !d.moved) onZoom(factor)
  }

  const btn = 'glass-soft grid h-9 w-9 touch-none select-none place-items-center rounded-full text-ink-soft transition hover:bg-white/80 active:scale-95'
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Tip label="Zoom out">
        <button aria-label="Zoom out" onPointerDown={down} onPointerMove={move} onPointerUp={up(1 / STEP)} onPointerCancel={() => (drag.current = null)} className={btn}>
          <IconZoom plus={false} size={19} />
        </button>
      </Tip>
      <Tip label="Zoom in">
        <button aria-label="Zoom in" onPointerDown={down} onPointerMove={move} onPointerUp={up(STEP)} onPointerCancel={() => (drag.current = null)} className={btn}>
          <IconZoom plus size={19} />
        </button>
      </Tip>
    </div>
  )
}
