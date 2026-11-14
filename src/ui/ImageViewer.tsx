import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './icons'

type ImageOrigin = { left: number; top: number; width: number; height: number }

/** Full-screen, touch-first image viewer: shared-viewport expansion, swipe between pictures, pinch/double-tap to zoom. */
export function ImageViewer({ images, initialIndex = 0, origin, onClose }: { images: string[]; initialIndex?: number; origin?: ImageOrigin; onClose: () => void }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)))
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [expanded, setExpanded] = useState(false)
  const [closing, setClosing] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ x: number; y: number } | null>(null)
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const pinched = useRef(false)
  const lastTap = useRef(0)
  const lastPoint = useRef({ x: 0, y: 0 })
  const closeTimer = useRef<number | null>(null)

  const resetZoom = () => { setZoom(1); setOffset({ x: 0, y: 0 }) }
  const move = (by: number) => {
    setIndex((i) => (i + by + images.length) % images.length)
    resetZoom()
  }
  const close = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, 340)
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setExpanded(true))
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.cancelAnimationFrame(frame)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') move(1)
      else if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [images.length, closing])

  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
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
    const originPoint = start.current
    const dx = originPoint ? e.clientX - originPoint.x : 0
    const dy = originPoint ? e.clientY - originPoint.y : 0
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
    else if (Math.abs(dy) > 75 && Math.abs(dy) > Math.abs(dx)) close()
    else if (isTap) {
      if (now - lastTap.current < 280) { setZoom(2.5); lastTap.current = 0 }
      else lastTap.current = now
    }
  }

  if (!images.length) return null
  const collapsed = closing || !expanded
  const frame = collapsed
    ? origin
      ? { left: origin.left, top: origin.top, width: origin.width, height: origin.height, borderRadius: '1rem', objectFit: 'cover' as const }
      : { left: '5vw', top: '5vh', width: '90vw', height: '90vh', borderRadius: '1rem', objectFit: 'contain' as const }
    : { left: 0, top: 0, width: '100vw', height: '100dvh', borderRadius: '0', objectFit: 'contain' as const }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${images.length}`}
      tabIndex={-1}
      className="fixed inset-0 z-[var(--z-viewer)] select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={down}
      onPointerMove={movePointer}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <img aria-hidden src={images[index]} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ filter: 'blur(26px) brightness(.38)', transform: 'scale(1.12)', opacity: expanded && !closing ? 1 : 0, transition: 'opacity 340ms ease' }} />
      <div className="absolute inset-0" style={{ background: 'rgba(8,8,14,.56)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', opacity: expanded && !closing ? 1 : 0, transition: 'opacity 340ms ease' }} />
      <img
        key={index}
        src={images[index]}
        alt={`Image ${index + 1} of ${images.length}`}
        draggable={false}
        className="pointer-events-none absolute"
        style={{
          ...frame,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transition: pointers.current.size ? 'none' : 'left 340ms cubic-bezier(.22,.8,.25,1), top 340ms cubic-bezier(.22,.8,.25,1), width 340ms cubic-bezier(.22,.8,.25,1), height 340ms cubic-bezier(.22,.8,.25,1), border-radius 340ms ease, transform 120ms ease-out',
          willChange: 'left,top,width,height,transform',
        }}
      />
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={close} aria-label="Close image" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white shadow-lg backdrop-blur-md transition hover:bg-black/50">
        <IconClose size={19} />
      </button>
      {images.length > 1 && (
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/35 px-3 py-2 backdrop-blur-md">
          {images.map((_, i) => (
            <span key={i} aria-label={`Image ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/45'}`} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
