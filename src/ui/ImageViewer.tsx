import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './icons'

type OriginRect = { x: number; y: number; width: number; height: number }

/** Full-screen, touch-first image viewer: swipe between pictures, swipe vertically to dismiss, pinch/double-tap to zoom. */
export function ImageViewer({ images, initialIndex = 0, originRect, onClose }: { images: string[]; initialIndex?: number; originRect?: OriginRect; onClose: () => void }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)))
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [expanded, setExpanded] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ x: number; y: number } | null>(null)
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const pinched = useRef(false)
  const lastTap = useRef(0)
  const lastPoint = useRef({ x: 0, y: 0 })

  const resetZoom = () => { setZoom(1); setOffset({ x: 0, y: 0 }) }
  const closeViewer = useCallback(() => {
    if (closing) return
    setClosing(true)
    setExpanded(false)
    closeTimer.current = window.setTimeout(onClose, 280)
  }, [closing, onClose])
  const move = (by: number) => {
    setIndex((i) => (i + by + images.length) % images.length)
    resetZoom()
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => setExpanded(true))
    return () => {
      cancelAnimationFrame(frame)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    }
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeViewer()
      else if (e.key === 'ArrowRight') move(1)
      else if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [closeViewer, images.length])

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
    else if (Math.abs(dy) > 75 && Math.abs(dy) > Math.abs(dx)) closeViewer()
    else if (isTap) {
      if (now - lastTap.current < 280) { setZoom(2.5); lastTap.current = 0 }
      else lastTap.current = now
    }
  }

  if (!images.length) return null
  const startRect = originRect ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, width: 1, height: 1 }
  const frameStyle: React.CSSProperties = expanded
    ? { left: 0, top: 0, width: '100vw', height: '100dvh', borderRadius: 0 }
    : { left: startRect.x, top: startRect.y, width: startRect.width, height: startRect.height, borderRadius: 16 }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={'Image ' + (index + 1) + ' of ' + images.length}
      tabIndex={-1}
      className="fixed inset-0 z-[10000] select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={down}
      onPointerMove={movePointer}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="absolute inset-0 overflow-hidden bg-black/20 transition-[opacity,backdrop-filter] duration-300 ease-out" style={{ opacity: expanded ? 1 : 0, backdropFilter: expanded ? 'blur(18px) brightness(.48)' : 'blur(0px) brightness(1)' }}>
        <img src={images[index]} alt="" aria-hidden className="h-full w-full scale-110 object-cover opacity-65 blur-2xl" />
      </div>
      <div className="absolute overflow-hidden bg-black/10 shadow-2xl" style={{ ...frameStyle, position: 'fixed', transition: 'left 280ms cubic-bezier(.2,.8,.2,1), top 280ms cubic-bezier(.2,.8,.2,1), width 280ms cubic-bezier(.2,.8,.2,1), height 280ms cubic-bezier(.2,.8,.2,1), border-radius 280ms ease', willChange: 'left,top,width,height,border-radius' }}>
        <img
          key={index}
          src={images[index]}
          alt={'Image ' + (index + 1) + ' of ' + images.length}
          draggable={false}
          className="h-full w-full object-contain"
          style={{ transform: 'translate(' + offset.x + 'px,' + offset.y + 'px) scale(' + zoom + ')', transition: pointers.current.size ? 'none' : 'transform 120ms ease-out', willChange: 'transform' }}
        />
      </div>
      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={closeViewer} aria-label="Close image" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white shadow-lg backdrop-blur-md transition hover:bg-black/55">
        <IconClose size={19} />
      </button>
      {images.length > 1 && (
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/35 px-3 py-2 backdrop-blur-md">
          {images.map((_, i) => (
            <span key={i} aria-label={'Image ' + (i + 1)} className={'h-1.5 rounded-full transition-all ' + (i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50')} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
