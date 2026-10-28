import { useRef, useState } from 'react'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { usePointerDrag } from './dnd'

export interface FloatOptions {
  /** Fraction -> client px, and back. Default: linear within the container. */
  toClient?: (fx: number, fy: number) => { cx: number; cy: number }
  fromClient?: (cx: number, cy: number) => { fx: number; fy: number }
  clamp?: { minX: number; maxX: number; minY: number; maxY: number }
  /** Called while dragging with the node's new center (as a fraction). */
  onDrag?: (fx: number, fy: number) => void
  onGrab?: () => void
  /** Node renders itself at the pointer everywhere (no chip needed). */
  selfGhost?: boolean
  /** `committed` is false when the drop landed on a folder/day/etc. */
  onRelease?: (committed: boolean) => void
}

/**
 * Drag a free-floating node (pond bubble, priority-plot bubble). It follows the
 * pointer, can travel over the sidebar, and dropping on a folder/day tags it.
 * Released on empty space it commits a new position.
 */
export function useFloatDrag(
  task: Task,
  container: React.RefObject<HTMLElement | null>,
  getFrac: () => { x: number; y: number },
  onCommit: (fx: number, fy: number) => void,
  opts: FloatOptions = {},
) {
  const select = useStore((s) => s.select)
  const dropTask = useStore((s) => s.dropTask)
  const [pos, setPos] = useState<{ cx: number; cy: number } | null>(null)
  const start = useRef({ cx: 0, cy: 0 })
  const last = useRef({ cx: 0, cy: 0 })
  const o = useRef(opts)
  o.current = opts

  const rect = () => container.current?.getBoundingClientRect()
  const toClient = (fx: number, fy: number) => {
    if (o.current.toClient) return o.current.toClient(fx, fy)
    const r = rect()!
    return { cx: r.left + fx * r.width, cy: r.top + fy * r.height }
  }
  const fromClient = (cx: number, cy: number) => {
    if (o.current.fromClient) return o.current.fromClient(cx, cy)
    const r = rect()!
    return { fx: (cx - r.left) / r.width, fy: (cy - r.top) / r.height }
  }

  const onPointerDown = usePointerDrag({
    payload: { type: 'task', id: task.id },
    label: task.title,
    // the node moves itself inside the container; a chip only appears once it leaves
    ghost: (x, y) => {
      if (o.current.selfGhost) return false
      // with the drawer pulled open the bubble itself is underneath it: show the chip above
      if (useStore.getState().sidebarOpen) return true
      const r = rect()
      return !r || x < r.left || x > r.right || y < r.top || y > r.bottom
    },
    onStart: () => {
      const f = getFrac()
      start.current = toClient(f.x, f.y)
      o.current.onGrab?.()
    },
    onMove: (_x, _y, dx, dy) => {
      last.current = { cx: start.current.cx + dx, cy: start.current.cy + dy }
      setPos(last.current)
      const f = fromClient(last.current.cx, last.current.cy)
      o.current.onDrag?.(f.fx, f.fy)
    },
    onEnd: ({ target }) => {
      setPos(null)
      if (target) {
        dropTask(task.id, target)
        o.current.onRelease?.(false)
        return
      }
      const c = o.current.clamp ?? { minX: 0.04, maxX: 0.96, minY: 0.06, maxY: 0.94 }
      const f = fromClient(last.current.cx, last.current.cy)
      onCommit(Math.min(c.maxX, Math.max(c.minX, f.fx)), Math.min(c.maxY, Math.max(c.minY, f.fy)))
      o.current.onRelease?.(true)
    },
    onClick: () => select(task.id),
  })

  return { onPointerDown, dragging: pos }
}
