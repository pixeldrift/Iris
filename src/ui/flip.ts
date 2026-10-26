import { useLayoutEffect, useRef } from 'react'
import { useDnd } from './dnd'
import { SPRING } from './lift'

/**
 * Neighbours glide to their new places (with the same gentle spring) when a list reorders.
 * Mark each item `data-flip="<id>"`. Positions are measured relative to `root`, so scrolling
 * never reads as movement, and nothing animates while a drag is previewing a gap.
 */
export function useFlip(root: React.RefObject<HTMLElement | null>) {
  const prev = useRef(new Map<string, { x: number; y: number }>())
  useLayoutEffect(() => {
    const host = root.current
    if (!host) return
    const hr = host.getBoundingClientRect()
    const next = new Map<string, { x: number; y: number }>()
    const dragging = !!useDnd.getState().drag
    const landing = document.body.dataset.landing
    host.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
      const r = n.getBoundingClientRect()
      const pos = { x: r.left - hr.left, y: r.top - hr.top }
      const id = n.dataset.flip!
      next.set(id, pos)
      const before = prev.current.get(id)
      // the item being landed is animated by the lifted copy, not by this
      if (!before || dragging || (landing && n.dataset.liftId === landing)) return
      const dx = before.x - pos.x
      const dy = before.y - pos.y
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 440, easing: SPRING })
      }
    })
    prev.current = next
  })
}
