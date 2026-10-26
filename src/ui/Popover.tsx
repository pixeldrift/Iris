import { useEffect, useRef } from 'react'
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

  if (!mounted || !anchor.current) return null
  const r = anchor.current.getBoundingClientRect()
  const below = r.bottom + 8
  const style: React.CSSProperties = {
    top: below,
    maxHeight: Math.max(160, window.innerHeight - below - 12),
    ...(align === 'end' ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, Math.min(r.left, window.innerWidth - 240)) }),
    ['--ox' as string]: align === 'end' ? '90%' : '10%',
    ['--oy' as string]: '0%',
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
