import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'

/** Full-screen, touch-first image viewer: swipe between pictures, swipe vertically to dismiss, pinch/double-tap to zoom. */
export function ImageViewer({ images, initialIndex = 0, onClose }: { images: string[]; initialIndex?: number; onClose: () => void }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)))
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ x: number; y: number } | null>(null)
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const pinched = useRef(false)
  const lastTap = useRef(0)
  const lastPoint = useRef({ x: 0, y: 0 })

  const resetZoom = () => { setZoom(1); setOffset({ x: 0, y: 0 }) }
  const move = (by: number) => {
    setIndex((i) => (i + by + images.length) % images.length)
    resetZoom()
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') move(1)
      else if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, images.length])

  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      start.current = { x: e.clientX, y: e.clientY }
      lastPoint.current = { x: e.clientX, y: e.clientY }
      pinched.current = false
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: distance(a, b), zoom }
      pinched.current = true
    }
  }
  const movePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const base = pinch.current
      if (base) setZoom(Math.max(1, Math.min(5, base.zoom * distance(a, b) / Math.max(1, base.distance))))
      return
    }
    if (zoom > 1 && start.current) {
      const dx = e.clientX - lastPoint.current.x
      const dy = e.clientY - lastPoint.current.y
      setOffset((p) => ({ x: p.x + dx, y: p.y + dy }))
      lastPoint.current = { x: e.clientX, y: e.clientY }
    }
  }
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const origin = start.current
    const dx = origin ? e.clientX - origin.x : 0
    const dy = origin ? e.clientY - origin.y : 0
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size > 0) return
    start.current = null
    if (pinched.current) { pinched.current = false; return }
    const now = Date.now()
    const isTap = Math.abs(dx) < 12 && Math.abs(dy) < 12
    if (zoom > 1) {
      if (isTap && now - lastTap.current < 280) { resetZoom(); lastTap.current = 0 }
      else lastTap.current = isTap ? now : 0
      return
    }
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.15) move(dx < 0 ? 1 : -1)
    else if (Math.abs(dy) > 75 && Math.abs(dy) > Math.abs(dx)) onClose()
    else if (isTap) {
      if (now - lastTap.current < 280) { setZoom(2.5); lastTap.current = 0 }
      else lastTap.current = now
    }
  }

  if (!images.length) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${images.length}`}
      tabIndex={-1}
      className="fixed inset-0 z-[9999] flex select-none items-center justify-center bg-[rgba(12,12,20,.97)]"
      style={{ touchAction: 'none', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onPointerDown={down}
      onPointerMove={movePointer}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="Close image" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white/90 backdrop-blur transition hover:bg-white/25">
        <IconClose size={18} />
      </button>
      <img
        key={index}
        src={images[index]}
        alt={`Image ${index + 1} of ${images.length}`}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transition: pointers.current.size ? 'none' : 'transform 120ms ease-out', willChange: 'transform' }}
      />
      {images.length > 1 && (
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/25 px-3 py-2">
          {images.map((_, i) => (
            <span key={i} aria-label={`Image ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/45'}`} />
          ))}
        </div>
      )}
    </div>
  )
}
