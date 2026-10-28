import { useLayoutEffect, useRef } from 'react'
import { useDnd } from './dnd'
import { SPRING } from './lift'

/**
 * Neighbors glide to their new places (with the same gentle spring) when a list reorders.
 * Mark each item `data-flip="<id>"` (or `data-<attr>`). Positions are measured relative to `root`, so scrolling
 * never reads as movement, and nothing animates while a drag is previewing a gap.
 */
export function useFlip(root: React.RefObject<HTMLElement | null>, attr = 'flip') {
  const prev = useRef(new Map<string, { x: number; y: number }>())

  const measure = () => {
    const host = root.current
    const out = new Map<string, { x: number; y: number }>()
    if (!host) return out
    const hr = host.getBoundingClientRect()
    host.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((n) => {
      const r = n.getBoundingClientRect()
      out.set(n.getAttribute(`data-${attr}`)!, { x: r.left - hr.left, y: r.top - hr.top })
    })
    return out
  }

  // Things that resize without a render (a section folding shut) must not read as movement later.
  useLayoutEffect(() => {
    const host = root.current
    if (!host) return
    const ro = new ResizeObserver(() => {
      prev.current = measure()
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const host = root.current
    if (!host) return
    const next = measure()
    const dragging = !!useDnd.getState().drag
    const landing = document.body.dataset.landing
    host.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((n) => {
      const id = n.getAttribute(`data-${attr}`)!
      const pos = next.get(id)!
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
