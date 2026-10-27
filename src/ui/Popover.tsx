import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useExit } from './anim'

/** Anchored popover with outside-click / Esc to close and a springy pop. */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  align = 'start',
  className = '',
}: {
  open: boolean
  onClose: () => void
  anchor: React.RefObject<HTMLElement | null>
  children: React.ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const { mounted, closing } = useExit(open, 180)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [open, onClose, anchor])

  // whatever its width, never let it run off either side of the screen (the anchor can sit near an edge)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // offsets, not screen rects: the pop-in animation is still scaling the box when this runs
    const left = el.offsetLeft
    const right = left + el.offsetWidth
    if (left < 8) {
      el.style.right = 'auto'
      el.style.left = '8px'
    } else if (right > window.innerWidth - 8) {
      el.style.left = 'auto'
      el.style.right = '8px'
    }
  })

  if (!mounted || !anchor.current) return null
  const r = anchor.current.getBoundingClientRect()
  // open below the anchor, or above it when there isn't room below
  const spaceBelow = window.innerHeight - r.bottom - 12
  const spaceAbove = r.top - 12
  const up = spaceBelow < 320 && spaceAbove > spaceBelow
  const style: React.CSSProperties = {
    ...(up ? { bottom: window.innerHeight - r.top + 8, maxHeight: Math.max(160, spaceAbove - 8) } : { top: r.bottom + 8, maxHeight: Math.max(160, spaceBelow - 8) }),
    ...(align === 'end' ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, Math.min(r.left, window.innerWidth - 240)) }),
    maxWidth: 'calc(100vw - 16px)',
    ['--ox' as string]: align === 'end' ? '90%' : '10%',
    ['--oy' as string]: up ? '100%' : '0%',
  }
  return createPortal(
    <div
      ref={box}
      style={style}
      className={`glass glass-strong fixed z-[150] min-w-[12rem] overflow-y-auto rounded-2xl p-1.5 ${closing ? 'pop-out' : 'pop-in'} ${className}`}
    >
      {children}
    </div>,
    document.body,
  )
}

export function MenuItem({
  children,
  active,
  onClick,
  trailing,
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
  trailing?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-lilac-100/80 ${active ? 'font-medium text-lilac-700' : ''}`}
    >
      <span className="flex-1">{children}</span>
      {trailing}
    </button>
  )
}
