import { useRef, useState } from 'react'
import type { Task } from '../core/types'
import { useStore } from '../state/store'
import { usePointerDrag } from './dnd'

/**
 * Drag a free-floating node (pond bubble, priority-plot bubble). While dragging
 * it follows the pointer in viewport space, so it can travel over the sidebar
 * and drop onto a folder. Released on empty space it commits a new position.
 */
export function useFloatDrag(
  task: Task,
  container: React.RefObject<HTMLElement | null>,
  frac: { x: number; y: number },
  onCommit: (fx: number, fy: number) => void,
) {
  const select = useStore((s) => s.select)
  const dropTask = useStore((s) => s.dropTask)
  const [pos, setPos] = useState<{ cx: number; cy: number } | null>(null)
  const start = useRef({ cx: 0, cy: 0 })
  const last = useRef({ cx: 0, cy: 0 })

  const onPointerDown = usePointerDrag({
    payload: { type: 'task', id: task.id },
    label: task.title,
    ghost: false,
    onStart: () => {
      const r = container.current?.getBoundingClientRect()
      if (!r) return
      start.current = { cx: r.left + frac.x * r.width, cy: r.top + frac.y * r.height }
    },
    onMove: (_x, _y, dx, dy) => {
      last.current = { cx: start.current.cx + dx, cy: start.current.cy + dy }
      setPos(last.current)
    },
    onEnd: ({ target }) => {
      setPos(null)
      if (target) {
        dropTask(task.id, target)
        return
      }
      const r = container.current?.getBoundingClientRect()
      if (!r) return
      const fx = Math.min(0.96, Math.max(0.04, (last.current.cx - r.left) / r.width))
      const fy = Math.min(0.94, Math.max(0.06, (last.current.cy - r.top) / r.height))
      onCommit(fx, fy)
    },
    onClick: () => select(task.id),
  })

  return { onPointerDown, dragging: pos }
}
