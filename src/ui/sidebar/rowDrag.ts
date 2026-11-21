import { useRef } from 'react'
import { create } from 'zustand'
import { useDnd, usePointerDrag, type Payload } from '../dnd'

/**
 * Putting the rows of a flat sidebar list in a new order, the way groups are moved: the row is lifted and follows the pointer's height, a line shows
 * the gap it would drop into, the others glide aside, and where it lands it settles. (A group also has depth; these rows only have an order.)
 * Rows carry `data-reorder-row="<id>"` inside an element carrying `data-reorder-list="<listId>"`.
 */

/** Where a carried row would go: in front of this row, or (null) at the end. */
export const useRowSlot = create<{ list: string | null; beforeId: string | null }>(() => ({ list: null, beforeId: null }))

/** The slot for height `y` among the list's rows (not counting the carried one, nor the room an open gap takes up). */
export function rowSlotFor(listId: string, dragId: string, y: number): string | null {
  const list = document.querySelector(`[data-reorder-list="${listId}"]`)
  if (!list) return null
  const gaps = [...list.querySelectorAll<HTMLElement>('[data-gap]')].map((g) => g.getBoundingClientRect()).map((g) => ({ top: g.top, h: g.height }))
  const flat = (v: number) => gaps.reduce((acc, g) => acc - Math.min(Math.max(v - g.top, 0), g.h), v)
  const at = flat(y)
  for (const el of list.querySelectorAll<HTMLElement>('[data-reorder-row]')) {
    if (el.dataset.reorderRow === dragId) continue
    const b = el.getBoundingClientRect()
    if ((flat(b.top) + flat(b.bottom)) / 2 > at) return el.dataset.reorderRow!
  }
  return null
}

/** The new order after `id` is dropped in front of `beforeId` (null: last). */
export function reordered(ids: string[], id: string, beforeId: string | null): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId)
  return [...rest.slice(0, at < 0 ? rest.length : at), id, ...rest.slice(at < 0 ? rest.length : at)]
}

/** Pointer handler for one row of a reorderable list; give it to the row (and its grip, with `true`). */
export function useRowDrag(opts: { listId: string; type: Payload['type']; id: string; label: string; row: React.RefObject<HTMLElement | null>; ids: string[]; onOrder: (ids: string[]) => void }) {
  const raf = useRef(0)
  const y = useRef(0)
  const refresh = () => {
    const before = rowSlotFor(opts.listId, opts.id, y.current)
    const cur = useRowSlot.getState()
    if (cur.list !== opts.listId || cur.beforeId !== before) useRowSlot.setState({ list: opts.listId, beforeId: before })
  }
  return usePointerDrag({
    payload: { type: opts.type, id: opts.id },
    label: opts.label,
    touchNeedsHandle: true,
    lift: () => opts.row.current,
    liftOpaque: true,
    lockX: true,
    resolve: (x, py) => {
      const r = document.querySelector(`[data-reorder-list="${opts.listId}"]`)?.getBoundingClientRect()
      return r && x <= r.right + 40 && py >= r.top - 30 && py <= r.bottom + 30 ? 'slot' : null
    },
    onStart: () => {
      // (a finger at rest sends no moves while the rows glide under it: keep reading the slot)
      const tick = () => {
        refresh()
        raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    },
    onMove: (_x, py) => {
      y.current = py
      refresh()
    },
    onEnd: ({ target }) => {
      cancelAnimationFrame(raf.current)
      refresh()
      const { beforeId } = useRowSlot.getState()
      useRowSlot.setState({ list: null, beforeId: null })
      if (target !== 'slot') return
      const next = reordered(opts.ids, opts.id, beforeId)
      if (next.some((x, i) => x !== opts.ids[i])) opts.onOrder(next)
    },
  })
}

/** True while a row of this list is carried and would land in front of `beforeId` (null: at the end). */
export function useGapOpen(listId: string, beforeId: string | null): boolean {
  const open = useRowSlot((s) => s.list === listId && s.beforeId === beforeId)
  const dragging = useDnd((s) => !!s.drag)
  return open && dragging
}
